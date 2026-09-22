/**
 * "Explain this number" — the index behind the Assay's drawer (Stage 3).
 *
 * Every figure on the page can be opened, and what opens is always the same
 * four things: what the number is in plain words, the formula CLAUDE.md
 * specifies for it, the trades it was computed from, and — where the claim is
 * about a mean — its §6.6 confidence.
 *
 * This module runs on the server, reads only `AssayResult`, and emits
 * pre-formatted strings. It computes no metric of its own (§16): where it
 * looks like arithmetic is happening, it is a share of a total the engine
 * already reported, done for the reader's benefit and never fed back into a
 * score.
 */

import type { AssayResult } from '@/lib/engine';
import type { ConfidenceResult } from '@/lib/engine/confidence';
import { CONFIDENCE_LABELS } from '@/lib/engine/confidence';
import type { EnrichedTrade, ImpurityKind } from '@/lib/engine/enrich';
import type { Finding } from '@/lib/engine/findings';
import type { GapLine, KaratGapResult } from '@/lib/engine/gap';
import type { Deduction, PillarKey, PillarResult } from '@/lib/engine/karat';
import type { EngineSettings } from '@/lib/engine/settings';
import { formatKarat, formatMoney, formatPct, formatR } from '@/lib/format';
import type {
  ExplainConfidence,
  ExplainEntry,
  ExplainIndex,
  ExplainLine,
  ExplainRow,
  ExplainTone,
} from './explain-types';

/** Trades listed in the drawer before it starts summarising. */
const MAX_ROWS = 12;

const DAY_MS = 86_400_000;

/* -------------------------------------------------------------------------
 * Scope — what period and weighting a number covers (Stage 3.5)
 *
 * The Assay shows two kinds of number side by side. The pillars are the Karat
 * Score's own: a rolling window, recency-weighted. The Refinery's findings are
 * measured over their own period, unweighted. Both are correct and they can
 * disagree — Market Conditions can score 9.1 / 10 while the top finding is a
 * five-figure news-window loss — so every value says which kind it is.
 * ---------------------------------------------------------------------- */

/** Printed beside every pillar value: `30-day · recency-weighted`. */
export function pillarScopeLabel(settings: EngineSettings): string {
  return `${settings.rollingWindowDays}-day · recency-weighted`;
}

/** The one sentence both drawers carry, pillar and finding alike. */
export function scopeNote(settings: EngineSettings): string {
  return `Pillars score the last ${settings.rollingWindowDays} days, weighted towards the most recent trades; a Refinery finding counts every trade in its own period, unweighted — so a habit that has mostly stopped can still lead the Refinery while its pillar scores well, and both numbers are right.`;
}

/** The whole history the engine was given: `90 days · 2026-06-22 → 2026-09-20`. */
export function historyPeriodLabel(assay: AssayResult): string {
  const first = assay.trades.reduce<number | null>(
    (earliest, trade) =>
      earliest === null || trade.openTimeMs < earliest ? trade.openTimeMs : earliest,
    null,
  );
  const end = assay.asOf.slice(0, 10);
  if (first === null) return end;
  const days = Math.max(Math.round((Date.parse(assay.asOf) - first) / DAY_MS), 1);
  return `${days} days · ${new Date(first).toISOString().slice(0, 10)} → ${end}`;
}

/**
 * The period a Refinery finding was measured over. "Outside your normal"
 * compares the last few days against everything before them; every other
 * finding counts the whole history.
 */
export function findingPeriodLabel(finding: Finding, assay: AssayResult): string {
  if (finding.kind === 'outside-normal') {
    return `Last ${assay.baselines.recentDays} days · against your history`;
  }
  return historyPeriodLabel(assay);
}

/* -------------------------------------------------------------------------
 * Small formatters
 * ---------------------------------------------------------------------- */

/** `2026-09-11T12:36:00.000Z` → `2026-09-11 12:36` (UTC, as everything is). */
export function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** `2026-09-11T…` → `2026-09-11`. */
function formatDay(iso: string): string {
  return iso.slice(0, 10);
}

const IMPURITY_LABELS: Record<ImpurityKind, string> = {
  revenge: 'Revenge',
  news: 'News window',
  rollover: 'Rollover',
  oversized: 'Oversized',
  noStop: 'No stop',
  stopWidened: 'Stop widened',
  exitOverrun: 'Exit overrun',
};

function toneForR(value: number): ExplainTone {
  if (value > 0) return 'profit';
  if (value < 0) return 'loss';
  return 'neutral';
}

function pluralTrades(count: number): string {
  return count === 1 ? '1 trade' : `${count} trades`;
}

/* -------------------------------------------------------------------------
 * Trade rows
 * ---------------------------------------------------------------------- */

interface RowsResult {
  rows: ExplainRow[];
  note: string | null;
}

/**
 * The trades behind a number, worst first.
 *
 * Costs are read by opening the worst offender, so the list is sorted by net
 * P&L ascending and truncated — a drawer listing 65 trades is a data dump, not
 * an explanation. The note says exactly what was left out.
 */
function tradeRows(
  tradeIds: readonly string[],
  byId: ReadonlyMap<string, EnrichedTrade>,
  options: { order?: 'worst' | 'best' | 'time' } = {},
): RowsResult {
  const order = options.order ?? 'worst';
  const trades = tradeIds
    .map((id) => byId.get(id))
    .filter((trade): trade is EnrichedTrade => trade !== undefined);

  const sorted = [...trades].sort((a, b) => {
    if (order === 'time') return a.openTimeMs - b.openTimeMs;
    if (order === 'best') return b.rMultiple - a.rMultiple;
    return a.netProfit - b.netProfit;
  });

  const shown = sorted.slice(0, MAX_ROWS);
  const rows: ExplainRow[] = shown.map((trade) => ({
    tradeId: trade.id,
    time: formatUtc(trade.openTime),
    r: formatR(trade.rMultiple),
    reason:
      trade.impurities.length > 0
        ? trade.impurities.map((kind) => IMPURITY_LABELS[kind]).join(', ')
        : 'No impurity',
    tone: toneForR(trade.rMultiple),
  }));

  if (sorted.length <= MAX_ROWS) {
    return { rows, note: null };
  }

  const which =
    order === 'best' ? 'strongest' : order === 'time' ? 'earliest' : 'costliest';
  return {
    rows,
    note: `Showing the ${which} ${MAX_ROWS} of ${sorted.length} trades.`,
  };
}

/* -------------------------------------------------------------------------
 * Confidence
 * ---------------------------------------------------------------------- */

const CONFIDENCE_MEANING: Record<string, string> = {
  strong:
    'At least 20 trades, and the 95% interval does not contain zero. The direction of this number is unlikely to be luck.',
  moderate:
    'At least 10 trades, and the 80% interval does not contain zero. Suggestive, not settled.',
  weak: 'Not enough evidence to call. The number is reported, not relied on.',
};

function explainConfidence(confidence: ConfidenceResult | null): ExplainConfidence | null {
  if (confidence === null || confidence.n === 0) return null;
  return {
    label: CONFIDENCE_LABELS[confidence.label],
    sample: `n = ${confidence.n} · mean ${formatR(confidence.meanR)}`,
    interval: `95% CI ${formatR(confidence.ci95.low)} → ${formatR(confidence.ci95.high)}`,
    winRate: `Win rate ${formatPct(confidence.winRate)} (${formatPct(
      confidence.winRateInterval.low,
    )}–${formatPct(confidence.winRateInterval.high)})`,
    pValue:
      confidence.pValue < 0.001
        ? 'p < 0.001 · bootstrap, 2,000 resamples'
        : `p = ${confidence.pValue.toFixed(3)} · bootstrap, ${confidence.resamples.toLocaleString('en-US')} resamples`,
    meaning: CONFIDENCE_MEANING[confidence.label] ?? CONFIDENCE_MEANING.weak ?? '',
  };
}

/* -------------------------------------------------------------------------
 * Formulas, quoted from CLAUDE.md
 * ---------------------------------------------------------------------- */

function pillarFormula(key: PillarKey, settings: EngineSettings): string {
  const limit = formatPct(settings.riskLimitPercent);
  switch (key) {
    case 'risk':
      return `risk% = initial risk ÷ equity at entry. A trade scores 1 at or under ${limit}, falls linearly to 0 at ${settings.riskZeroMultiple}× the limit, and scores 0 above it. A trade with no stop scores 0. Pillar = 25 × Σ(weight × score) ÷ Σweight.`;
    case 'revenge':
      return `A revenge trade is one opened within ${settings.revengeWindowMinutes} min of a losing close, or sized above ${settings.revengeLotMultiple}× the previous trade's lot after a loss. Pillar = 20 × (1 − revenge ÷ all trades), recency-weighted.`;
    case 'stops':
      return `Compliant = a stop set within ${settings.stopSetWithinSeconds} s of entry and never moved further from entry. Pillar = 15 × the compliant ratio.`;
    case 'exits':
      return `70% from the overrun ratio — losses worse than ${formatR(settings.exitOverrunR)}, over all losses. 30% from holding asymmetry = median loser duration ÷ median winner duration; score = clamp(1 − (ratio − 1) ÷ 2, 0, 1), and 1 when the ratio is at or under 1.`;
    case 'overtrading':
      return `A UTC day is violating when it holds more than ${settings.dailyMaxTrades} trades. Pillar = 15 × (1 − violating days ÷ active days), each day weighted by the mean recency weight of its own trades.`;
    case 'market':
      return `Flagged = an entry inside a news window (±${settings.newsWindowMinutes} min of a high-impact USD release) or the rollover window (broker midnight ±${settings.rolloverWindowMinutes} min). Pillar = 10 × (1 − flagged ÷ all trades). Trades tagged ${settings.newsStrategyTag} are exempt.`;
  }
}

const PILLAR_DEFINITION: Record<PillarKey, string> = {
  risk: 'How much of the account each trade put at risk, against the limit you set. Size is the one decision that turns a good edge into a bad month.',
  revenge:
    'Trades opened straight after a loss, or sized up after one. The clock and the lot size are what give it away, not the result.',
  stops:
    'Whether a stop was on the position in time, and whether it stayed where it was put. Moving a stop further away is the deduction; trailing it closer never is.',
  exits:
    'How losses were cut, and whether losers were held longer than winners. It scores the exit, not the entry.',
  overtrading: 'Days that went past your own daily trade limit.',
  market:
    'Entries taken into a high-impact USD release or the rollover window, where the spread widens and the price is not really yours to read.',
};

const GAP_PILLAR_FORMULA: Record<string, string> = {
  revenge: "The trade's whole net loss. A revenge trade that happened to win costs nothing.",
  market:
    "The trade's whole net loss, counted here only when the trade was not already billed to Revenge.",
  risk: 'loss × (1 − limit ÷ actual risk%) — the part of the loss that oversizing added, not the whole loss.',
  exits: 'The part of the loss beyond −1R. The first R was the plan; the rest was the exit.',
};

/* -------------------------------------------------------------------------
 * Finding metrics
 * ---------------------------------------------------------------------- */

const METRIC_LABELS: Record<string, string> = {
  trades: 'Trades',
  losses: 'Losses',
  windowMinutes: 'Window',
  avgR: 'Average R',
  shareOfTrades: 'Share of trades',
  startHour: 'From',
  endHour: 'To',
  winRate: 'Win rate',
  weekday: 'Weekday',
  days: 'Days',
  activeDays: 'Active days',
  dailyMax: 'Daily limit',
  avgSpreadPoints: 'Average spread',
  limitPercent: 'Risk limit',
  worstRiskPercent: 'Worst risk',
  overrunR: 'Overrun threshold',
  worstR: 'Worst trade',
  magic: 'Magic number',
  recentExpectancyR: 'Recent expectancy',
  baselineExpectancyR: 'Baseline expectancy',
  standardErrors: 'Standard errors below',
  fineness: 'Fineness',
  correlation: 'Correlation',
  magicA: 'EA',
  magicB: 'EA',
  threshold: 'Threshold',
};

/** Keys whose numbers are not plain counts. */
function formatMetric(key: string, value: number | string): string {
  if (typeof value === 'string') return value;
  switch (key) {
    case 'avgR':
    case 'worstR':
    case 'overrunR':
    case 'recentExpectancyR':
    case 'baselineExpectancyR':
      return formatR(value);
    case 'shareOfTrades':
    case 'winRate':
    case 'limitPercent':
    case 'worstRiskPercent':
      return formatPct(value);
    case 'windowMinutes':
      return `±${value} min`;
    case 'startHour':
    case 'endHour':
      return `${String(value).padStart(2, '0')}:00 UTC`;
    case 'correlation':
    case 'threshold':
    case 'standardErrors':
      return value.toFixed(2);
    case 'fineness':
      return `${value.toFixed(1)}‰`;
    case 'avgSpreadPoints':
      return `${value.toFixed(1)} pts`;
    default:
      return String(value);
  }
}

function metricLines(finding: Finding): ExplainLine[] {
  return Object.entries(finding.metrics)
    .filter(([key]) => key !== 'weekdayIndex')
    .map(([key, value]) => ({
      label: METRIC_LABELS[key] ?? key,
      value: formatMetric(key, value),
    }));
}

/* -------------------------------------------------------------------------
 * The index
 * ---------------------------------------------------------------------- */

export const EXPLAIN_IDS = {
  karat: 'karat',
  proof: 'proof',
  pillar: (key: PillarKey): string => `pillar:${key}`,
  gapTotal: (scope: 'window' | 'all'): string => `gap:${scope}`,
  gapLine: (scope: 'window' | 'all', pillar: string): string => `gap:${scope}:${pillar}`,
  finding: (id: string): string => `finding:${id}`,
  whatIf: 'what-if',
} as const;

function pillarEntry(
  pillar: PillarResult,
  settings: EngineSettings,
  byId: ReadonlyMap<string, EnrichedTrade>,
  windowCaption: string,
): ExplainEntry {
  const lines: ExplainLine[] = pillar.deductions.map((deduction: Deduction) => ({
    label: `${deduction.reason} · ${pluralTrades(deduction.tradeIds.length)}`,
    value: `−${deduction.pointsLost.toFixed(2)}`,
    tone: 'loss' as const,
  }));

  const allIds = pillar.deductions.flatMap((deduction) => deduction.tradeIds);
  const unique = [...new Set(allIds)];
  const { rows, note } = tradeRows(unique, byId);

  return {
    id: EXPLAIN_IDS.pillar(pillar.key),
    eyebrow: `Pillar · ${pillar.maxPoints} points`,
    title: pillar.label,
    value: `${pillar.points.toFixed(1)} / ${pillar.maxPoints}`,
    valueTone: pillar.points >= pillar.maxPoints * 0.85 ? 'gold' : 'neutral',
    valueCaption: `${pillarScopeLabel(settings)} · ${pluralTrades(pillar.tradeCount)} scored · ${windowCaption}`,
    definition: PILLAR_DEFINITION[pillar.key],
    scopeNote: scopeNote(settings),
    formula: pillarFormula(pillar.key, settings),
    source: `CLAUDE.md §6.1 — ${pillar.label}`,
    lines,
    linesTitle: lines.length > 0 ? 'Points lost' : null,
    rows,
    rowsTitle: rows.length > 0 ? 'The trades behind it' : null,
    rowsNote: note,
    confidence: null,
    note:
      pillar.deductions.length === 0
        ? 'Nothing was deducted from this pillar in the window.'
        : 'Trades are weighted by recency: a half-life of 10 days, so last week costs more than the week before it.',
  };
}

function gapTotalEntry(
  gap: KaratGapResult,
  scope: 'window' | 'all',
  byId: ReadonlyMap<string, EnrichedTrade>,
  caption: string,
): ExplainEntry {
  const lines: ExplainLine[] = gap.lines.map((line: GapLine) => ({
    label: `${line.label} · ${pluralTrades(line.tradeCount)}`,
    value: formatMoney(-line.costMoney, { currency: gap.currency, signed: true }),
    tone: 'loss' as const,
  }));

  const ids = gap.attributions.map((attribution) => attribution.tradeId);
  const { rows, note } = tradeRows(ids, byId);

  return {
    id: EXPLAIN_IDS.gapTotal(scope),
    eyebrow: scope === 'window' ? 'Karat Gap · 30-day window' : 'Karat Gap · 90-day total',
    title: 'What indiscipline cost',
    value: formatMoney(-gap.totalCostMoney, { currency: gap.currency, signed: true }),
    valueTone: 'loss',
    valueCaption: `${formatR(-gap.totalCostR)} · ${pluralTrades(gap.impurityCount)} of ${gap.tradeCount} manual · ${caption}`,
    definition:
      'The money your impurity trades gave away. It is a bill, not a forecast: every dollar in it comes from a trade that has already closed.',
    scopeNote: null,
    formula:
      'Each impurity trade is attributed to exactly one pillar, in priority order: Revenge → Market Conditions → Risk → Exits. No dollar is billed twice, and a winning impurity trade costs nothing.',
    source: 'CLAUDE.md §6.3 — Karat Gap',
    lines,
    linesTitle: 'By pillar',
    rows,
    rowsTitle: 'The costliest trades',
    rowsNote: note,
    confidence: null,
    note: 'Stops has no line of its own — a stop that was never set or was widened shows up in the loss the Exits line bills.',
  };
}

function gapLineEntry(
  line: GapLine,
  gap: KaratGapResult,
  scope: 'window' | 'all',
  byId: ReadonlyMap<string, EnrichedTrade>,
  caption: string,
): ExplainEntry {
  const { rows, note } = tradeRows(line.tradeIds, byId);
  const share =
    gap.totalCostMoney > 0 ? (line.costMoney / gap.totalCostMoney) * 100 : 0;

  return {
    id: EXPLAIN_IDS.gapLine(scope, line.pillar),
    eyebrow: `Karat Gap · ${scope === 'window' ? '30-day window' : '90-day total'}`,
    title: line.label,
    value: formatMoney(-line.costMoney, { currency: gap.currency, signed: true }),
    valueTone: 'loss',
    valueCaption: `${formatR(-line.costR)} · ${pluralTrades(line.tradeCount)} · ${caption}`,
    definition: `What ${line.label.toLowerCase()} cost over this period, after the Gap decided which pillar each trade belongs to.`,
    scopeNote: null,
    formula: GAP_PILLAR_FORMULA[line.pillar] ?? '',
    source: 'CLAUDE.md §6.3 — Karat Gap',
    lines: [
      { label: 'Share of the Gap', value: formatPct(share) },
      { label: 'Trades billed here', value: String(line.tradeCount) },
    ],
    linesTitle: 'In context',
    rows,
    rowsTitle: 'The trades behind it',
    rowsNote: note,
    confidence: null,
    note: 'A trade carrying several impurities is billed once, to the first pillar in the priority order that matches it.',
  };
}

function findingEntry(
  finding: Finding,
  byId: ReadonlyMap<string, EnrichedTrade>,
  currency: string,
  period: string,
  settings: EngineSettings,
): ExplainEntry {
  const { rows, note } = tradeRows(finding.tradeIds, byId, {
    order: finding.impactMoney > 0 ? 'best' : 'worst',
  });

  const lines = metricLines(finding);
  lines.unshift({
    label: 'Money at stake',
    value: formatMoney(finding.impactMoney, { currency, signed: true }),
    tone: finding.impactMoney >= 0 ? 'profit' : 'loss',
  });
  lines.splice(1, 0, {
    label: 'In R',
    value: formatR(finding.impactR),
    tone: finding.impactR >= 0 ? 'profit' : 'loss',
  });

  return {
    id: EXPLAIN_IDS.finding(finding.id),
    eyebrow: finding.severity === 'strength' ? 'Refinery · An edge' : 'Refinery · A cost',
    title: finding.headline,
    value: formatMoney(finding.impactMoney, { currency, signed: true }),
    valueTone: finding.impactMoney >= 0 ? 'profit' : 'loss',
    valueCaption: `${formatR(finding.impactR)} · ${pluralTrades(finding.tradeIds.length)} · ${period} · unweighted`,
    definition:
      'A Refinery finding: a pattern the engine measured across your own trades. The sentence is a template filled from engine numbers — nothing here was estimated or written by a model.',
    scopeNote: scopeNote(settings),
    formula:
      'Findings are ranked by the money at stake, costs and edges alike. Severity is the share of the total Karat Gap a finding carries: 40% or more is critical, 15% or more a warning.',
    source: 'CLAUDE.md §6.6, §10 — The Refinery',
    lines,
    linesTitle: 'Measured',
    rows,
    rowsTitle: rows.length > 0 ? 'The trades behind it' : null,
    rowsNote: note,
    confidence: explainConfidence(finding.confidence),
    note: finding.tentative
      ? 'Weak evidence. Shown because it is real, marked because it cannot yet lead.'
      : 'The Refinery leads with Strong or Moderate findings only. Weaker ones stay in the data, marked tentative.',
  };
}

function karatEntry(assay: AssayResult, windowCaption: string): ExplainEntry {
  const { karat, delta, settings } = assay;
  const lines: ExplainLine[] = karat.pillars.map((pillar) => ({
    label: pillar.label,
    value: `${pillar.points.toFixed(1)} / ${pillar.maxPoints}`,
    tone: pillar.points >= pillar.maxPoints * 0.85 ? ('gold' as const) : ('neutral' as const),
  }));
  lines.push({
    label: 'Total points',
    value: `${karat.points.toFixed(2)} / ${karat.maxPoints}`,
  });

  return {
    id: EXPLAIN_IDS.karat,
    eyebrow: 'The Assay · 0–24K',
    title: 'Karat',
    value: karat.karat === null ? 'Assaying…' : formatKarat(karat.karat),
    valueTone: 'gold',
    valueCaption:
      karat.karat === null
        ? `${pluralTrades(karat.tradeCount)} of ${karat.minimumTrades} needed`
        : `${karat.tier?.label ?? ''} · ${windowCaption}`,
    definition:
      'How disciplined the last 30 days of manual trading were, on the scale real gold is measured on. It scores process, not outcome: a reckless profitable month scores low, and a disciplined losing month scores high.',
    scopeNote: null,
    formula: `Karat = points ÷ 100 × 24, to one decimal. Points are the six pillars added together, scored over a rolling ${settings.rollingWindowDays}-day window with an exponential recency weight (half-life ${settings.recencyHalfLifeDays} days). Fewer than ${settings.minimumTrades} manual trades in the window and no score is shown.`,
    source: 'CLAUDE.md §6.1, §6.2 — Karat Score and tiers',
    lines,
    linesTitle: 'The six pillars',
    rows: [],
    rowsTitle: null,
    rowsNote: null,
    confidence: null,
    note:
      delta.previous === null
        ? 'There is no comparable score a week ago, so no week-on-week move is shown.'
        : `A week ago the same window scored ${formatKarat(delta.previous)}. Both sides are scored the same way, so the move is a real change in behaviour and not a change of method. EA trades are never scored here — they are measured in Fineness (§7).`,
  };
}

function proofEntry(assay: AssayResult): ExplainEntry {
  const { proof } = assay;
  const lines: ExplainLine[] = [
    {
      label: `${proof.highKarat}K and above · ${proof.high.weekCount} weeks`,
      value: `${formatR(proof.high.avgWeeklyR)} a week`,
      tone: 'profit',
    },
    {
      label: `Under ${proof.lowKarat}K · ${proof.low.weekCount} weeks`,
      value: `${formatR(proof.low.avgWeeklyR)} a week`,
      tone: 'loss',
    },
    { label: 'Difference', value: `${formatR(proof.differenceR)} a week` },
  ];

  for (const week of proof.weeks) {
    lines.push({
      label: `${week.isoWeek} · ${pluralTrades(week.tradeCount)}`,
      value: `${formatKarat(week.karat)} · ${formatR(week.netR)}`,
      tone: week.bucket === 'high' ? 'gold' : week.bucket === 'low' ? 'loss' : 'neutral',
    });
  }

  return {
    id: EXPLAIN_IDS.proof,
    eyebrow: 'Your Proof',
    title: 'What discipline paid',
    value: `${formatR(proof.differenceR)} a week`,
    valueTone: proof.differenceR >= 0 ? 'profit' : 'loss',
    valueCaption: `${proof.high.weekCount} disciplined weeks against ${proof.low.weekCount} impure ones`,
    definition:
      'Your own weeks, split by how disciplined they were, and what each group actually returned. It is not a claim about trading in general — it is a claim about you.',
    scopeNote: null,
    formula: `Group manual trades by ISO week and score each week's own Karat, unweighted. Weeks at ${proof.highKarat}K and above go in one bucket, weeks under ${proof.lowKarat}K in the other; weeks with fewer than ${proof.minTradesPerWeek} trades are dropped. Compare the buckets' mean weekly R.`,
    source: 'CLAUDE.md §6.4 — Your Proof',
    lines,
    linesTitle: 'Week by week',
    rows: [],
    rowsTitle: null,
    rowsNote: null,
    confidence: null,
    note: `The card stays hidden unless each bucket holds at least ${proof.minWeeksPerBucket} weeks. With fewer, the difference is an anecdote.`,
  };
}

function whatIfEntry(
  assay: AssayResult,
  byId: ReadonlyMap<string, EnrichedTrade>,
  caption: string,
): ExplainEntry | null {
  const whatIf = assay.counterfactual;
  const all = whatIf.scenarios.find((scenario) => scenario.key === 'all');
  if (all === undefined) return null;

  const money = (value: number): string =>
    formatMoney(value, { currency: whatIf.currency, signed: true });
  const tone = (value: number): ExplainTone => (value >= 0 ? 'profit' : 'loss');
  const { rows, note } = tradeRows(all.removedTradeIds, byId);

  return {
    id: EXPLAIN_IDS.whatIf,
    eyebrow: `What-if · ${whatIf.label}`,
    title: 'Every impurity removed',
    value: money(all.deltaMoney),
    valueTone: tone(all.deltaMoney),
    valueCaption: `${formatR(all.deltaR)} · ${pluralTrades(all.removedTradeCount)} removed · ${caption}`,
    definition:
      'The account as it actually finished, against the same account with every impurity trade taken out — the winners among them too. It answers one question: what would this account read if those trades had never been placed, and everything else had happened as it did?',
    scopeNote: null,
    formula: `${whatIf.method} A manual trade carrying any impurity is removed; EA trades never are.`,
    source: 'CLAUDE.md §6.10 — Counterfactual',
    lines: [
      { label: 'Actual result', value: money(whatIf.actualEndMoney), tone: tone(whatIf.actualEndMoney) },
      { label: 'Every impurity removed', value: money(all.endMoney), tone: tone(all.endMoney) },
      { label: 'Difference', value: money(all.deltaMoney), tone: tone(all.deltaMoney) },
      {
        label: 'Trades removed',
        value: `${all.removedTradeCount} · ${all.removedWins} won · ${all.removedLosses} lost`,
      },
      {
        label: 'The Gap bills for the same trades',
        value: formatMoney(-all.gapCostMoney, { currency: whatIf.currency, signed: true }),
        tone: 'loss',
      },
    ],
    linesTitle: 'Actual against counterfactual',
    rows,
    rowsTitle: rows.length > 0 ? 'The costliest trades removed' : null,
    rowsNote: note,
    confidence: null,
    note: 'The Karat Gap is a bill, not a curve: it counts losses only, each trade once, to one pillar. The What-if removes whole trades, winners included. The two numbers are not supposed to match.',
  };
}

/** Builds every explanation the Assay can open. */
export function buildExplainIndex(assay: AssayResult): ExplainIndex {
  const byId = new Map(assay.trades.map((trade) => [trade.id, trade]));
  const index: ExplainIndex = {};

  const windowCaption = `${formatDay(assay.karat.windowStart)} → ${formatDay(assay.karat.windowEnd)}`;
  const first = assay.trades[0];
  const allCaption =
    first === undefined
      ? windowCaption
      : `${formatDay(first.openTime)} → ${formatDay(assay.asOf)}`;

  index[EXPLAIN_IDS.karat] = karatEntry(assay, windowCaption);

  for (const pillar of assay.karat.pillars) {
    index[EXPLAIN_IDS.pillar(pillar.key)] = pillarEntry(
      pillar,
      assay.settings,
      byId,
      windowCaption,
    );
  }

  const scopes = [
    { scope: 'window' as const, gap: assay.gap, caption: windowCaption },
    { scope: 'all' as const, gap: assay.gapAllTime, caption: allCaption },
  ];
  for (const { scope, gap, caption } of scopes) {
    index[EXPLAIN_IDS.gapTotal(scope)] = gapTotalEntry(gap, scope, byId, caption);
    for (const line of gap.lines) {
      index[EXPLAIN_IDS.gapLine(scope, line.pillar)] = gapLineEntry(
        line,
        gap,
        scope,
        byId,
        caption,
      );
    }
  }

  for (const finding of assay.refinery) {
    index[EXPLAIN_IDS.finding(finding.id)] = findingEntry(
      finding,
      byId,
      assay.account.currency,
      findingPeriodLabel(finding, assay),
      assay.settings,
    );
  }

  const whatIf = whatIfEntry(assay, byId, historyPeriodLabel(assay));
  if (whatIf !== null) index[EXPLAIN_IDS.whatIf] = whatIf;

  if (assay.proof.visible) {
    index[EXPLAIN_IDS.proof] = proofEntry(assay);
  }

  return index;
}
