/**
 * The Karat Score (CLAUDE.md §6) — six pillars, 100 points, 0–24K.
 *
 * It measures **process, not outcome**: a reckless profitable trader scores
 * low, a disciplined losing trader scores high. Only manual trades are scored
 * (§6); EA trades are measured in Fineness instead (§7, `ea.ts`).
 *
 * Every pillar returns `{ points, maxPoints, deductions }`, and every
 * deduction names the trades that caused it — the explainability contract in
 * §6.5 is the whole point of the file.
 */

import { formatPct, formatR } from '@/lib/format';
import type { EnrichedTrade } from './enrich';
import { manualTrades, recencyWeight, tradesInWindow } from './enrich';
import { clamp, mean, median, round, safeDivide, sum } from './math';
import type { EngineSettings } from './settings';
import { DAY_MS, toIso } from './time';

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

export type PillarKey =
  | 'risk'
  | 'revenge'
  | 'stops'
  | 'exits'
  | 'overtrading'
  | 'market';

/** One line of "why you lost these points", with the trades behind it (§6.5). */
export interface Deduction {
  reason: string;
  tradeIds: string[];
  pointsLost: number;
}

export interface PillarResult {
  key: PillarKey;
  label: string;
  points: number;
  maxPoints: number;
  /** Trades the pillar looked at. */
  tradeCount: number;
  deductions: Deduction[];
}

export interface Tier {
  label: string;
  /** Lowest Karat that earns this tier. */
  min: number;
}

export interface KaratResult {
  /** `assaying` while the window holds fewer than `minimumTrades` trades (§6.1). */
  state: 'scored' | 'assaying';
  /** Points ÷ 100 × 24, one decimal. `null` while assaying. */
  karat: number | null;
  tier: Tier | null;
  /** Total points, 0–100. Computed even while assaying — the rings still draw. */
  points: number;
  maxPoints: number;
  /** Manual trades in the window. */
  tradeCount: number;
  minimumTrades: number;
  windowStart: string;
  windowEnd: string;
  /** False for the unweighted scores used by Proof and the Vault. */
  weighted: boolean;
  pillars: PillarResult[];
}

/** Maximum points per pillar (CLAUDE.md §6.1). */
export const PILLAR_MAX: Record<PillarKey, number> = {
  risk: 25,
  revenge: 20,
  stops: 15,
  exits: 15,
  overtrading: 15,
  market: 10,
};

export const PILLAR_LABELS: Record<PillarKey, string> = {
  risk: 'Risk',
  revenge: 'Revenge',
  stops: 'Stops',
  exits: 'Exits',
  overtrading: 'Overtrading',
  market: 'Market Conditions',
};

/** Real gold karats (CLAUDE.md §6.2), highest first. */
export const TIERS: readonly Tier[] = [
  { label: '24K · Pure', min: 23.5 },
  { label: '22K · Refined', min: 22 },
  { label: '18K · Solid', min: 18 },
  { label: '14K · Mixed', min: 14 },
  { label: '10K · Alloyed', min: 10 },
  { label: 'Raw Ore', min: 0 },
];

/**
 * Tier for a Karat value.
 *
 * Choice: the tier is read from the **displayed** (one-decimal) Karat, so a
 * dial reading 23.5K can never be labelled 22K · Refined.
 */
export function tierFor(karat: number): Tier {
  const rounded = round(karat, 1);
  for (const tier of TIERS) {
    if (rounded >= tier.min) return tier;
  }
  return TIERS[TIERS.length - 1] ?? { label: 'Raw Ore', min: 0 };
}

/** Karat from points: 100 points is 24K (§6.1). */
export function karatFromPoints(points: number): number {
  return round((points / 100) * 24, 1);
}

/* -------------------------------------------------------------------------
 * Weighted scoring helpers
 * ---------------------------------------------------------------------- */

type WeightOf = (trade: EnrichedTrade) => number;

interface Scored {
  trade: EnrichedTrade;
  weight: number;
  /** 0–1: how much of this trade's weight the pillar awards. */
  score: number;
  /** Which deduction bucket the lost part belongs to, or `null` when nothing was lost. */
  reason: string | null;
}

/**
 * Turns per-trade scores into a pillar.
 *
 * `points = max × Σ(w·s) / Σw`, and each deduction bucket carries
 * `max × Σ(w·(1−s)) / Σw` — so the deductions always add up to exactly the
 * points that were lost, which is what §6.5 promises the UI.
 */
function pillarFromScores(
  key: PillarKey,
  scored: readonly Scored[],
): PillarResult {
  const maxPoints = PILLAR_MAX[key];
  const totalWeight = sum(scored.map((item) => item.weight));

  if (scored.length === 0 || totalWeight === 0) {
    return {
      key,
      label: PILLAR_LABELS[key],
      points: maxPoints,
      maxPoints,
      tradeCount: 0,
      deductions: [],
    };
  }

  const earned = sum(scored.map((item) => item.weight * item.score));
  const points = maxPoints * (earned / totalWeight);

  const buckets = new Map<string, { tradeIds: string[]; lostWeight: number }>();
  for (const item of scored) {
    if (item.reason === null || item.score >= 1) continue;
    const bucket = buckets.get(item.reason) ?? { tradeIds: [], lostWeight: 0 };
    bucket.tradeIds.push(item.trade.id);
    bucket.lostWeight += item.weight * (1 - item.score);
    buckets.set(item.reason, bucket);
  }

  const deductions = [...buckets.entries()]
    .map(([reason, bucket]) => ({
      reason,
      tradeIds: bucket.tradeIds,
      pointsLost: round((maxPoints * bucket.lostWeight) / totalWeight, 2),
    }))
    .filter((deduction) => deduction.pointsLost > 0)
    .sort((a, b) => b.pointsLost - a.pointsLost || a.reason.localeCompare(b.reason));

  return {
    key,
    label: PILLAR_LABELS[key],
    points: round(points, 2),
    maxPoints,
    tradeCount: scored.length,
    deductions,
  };
}

/* -------------------------------------------------------------------------
 * The six pillars (CLAUDE.md §6.1)
 * ---------------------------------------------------------------------- */

/**
 * Risk, 25 points. `risk% = initial risk ÷ equity at entry`. A trade at or
 * under the limit scores 1, falling linearly to 0 at 1.5× the limit, and a
 * trade opened without a stop scores 0 outright.
 */
export function riskTradeScore(
  trade: EnrichedTrade,
  settings: EngineSettings,
): number {
  if (trade.noStop) return 0;
  const limit = settings.riskLimitPercent;
  const zeroAt = limit * settings.riskZeroMultiple;
  if (trade.riskPercent <= limit) return 1;
  if (trade.riskPercent >= zeroAt) return 0;
  return (zeroAt - trade.riskPercent) / (zeroAt - limit);
}

function riskPillar(
  trades: readonly EnrichedTrade[],
  weightOf: WeightOf,
  settings: EngineSettings,
): PillarResult {
  const limitLabel = formatPct(settings.riskLimitPercent);
  return pillarFromScores(
    'risk',
    trades.map((trade) => {
      const score = riskTradeScore(trade, settings);
      return {
        trade,
        weight: weightOf(trade),
        score,
        reason: trade.noStop
          ? 'Opened without a stop'
          : score < 1
            ? `Risk above the ${limitLabel} limit`
            : null,
      };
    }),
  );
}

/** Revenge, 20 points: `20 × (1 − revenge ÷ all trades)`. */
function revengePillar(
  trades: readonly EnrichedTrade[],
  weightOf: WeightOf,
  settings: EngineSettings,
): PillarResult {
  const windowLabel = `${settings.revengeWindowMinutes} min`;
  const lotLabel = `${settings.revengeLotMultiple}×`;
  const reasons: Record<string, string> = {
    window: `Opened within ${windowLabel} of a loss`,
    size: `Lot over ${lotLabel} the previous trade after a loss`,
    both: `Opened within ${windowLabel} of a loss, and upsized`,
  };
  return pillarFromScores(
    'revenge',
    trades.map((trade) => ({
      trade,
      weight: weightOf(trade),
      score: trade.revenge ? 0 : 1,
      reason:
        trade.revenge && trade.revengeReason !== null
          ? (reasons[trade.revengeReason] ?? 'Revenge trade')
          : null,
    })),
  );
}

/** Stops, 15 points: `15 × compliant ratio` (set within 60 s, never widened). */
function stopsPillar(
  trades: readonly EnrichedTrade[],
  weightOf: WeightOf,
  settings: EngineSettings,
): PillarResult {
  return pillarFromScores(
    'stops',
    trades.map((trade) => ({
      trade,
      weight: weightOf(trade),
      score: trade.slCompliant ? 1 : 0,
      reason: trade.noStop
        ? `No stop within ${settings.stopSetWithinSeconds} s of entry`
        : trade.slWidened
          ? 'Stop moved further from entry'
          : null,
    })),
  );
}

/**
 * Exits, 15 points: 70% overrun ratio, 30% holding asymmetry.
 *
 * Choice (§6.1 does not say what the overrun ratio divides by): **losses**, not
 * all trades. The pillar asks how well losses are cut, and dividing by every
 * trade would hand a free pass to whoever simply lost less often — that is
 * outcome, and §6 scores process.
 *
 * Choice: the two medians behind the asymmetry are unweighted. A weighted
 * median over a handful of losers is unstable, and the recency weighting is
 * already carried by the window the trades come from.
 */
function exitsPillar(
  trades: readonly EnrichedTrade[],
  weightOf: WeightOf,
  settings: EngineSettings,
): PillarResult {
  const maxPoints = PILLAR_MAX.exits;
  const overrunShare = settings.exitOverrunWeight;
  const asymmetryShare = 1 - overrunShare;

  const losers = trades.filter((trade) => trade.isLoss);
  const winners = trades.filter((trade) => trade.isWin);

  const loserWeight = sum(losers.map(weightOf));
  const overruns = losers.filter((trade) => trade.exitOverrun);
  const overrunRatio =
    loserWeight === 0 ? 0 : sum(overruns.map(weightOf)) / loserWeight;

  const medianLoser = median(losers.map((trade) => trade.durationSeconds));
  const medianWinner = median(winners.map((trade) => trade.durationSeconds));
  const hasAsymmetry = losers.length > 0 && winners.length > 0 && medianWinner > 0;
  const holdingRatio = hasAsymmetry ? medianLoser / medianWinner : 1;
  const asymmetryScore =
    holdingRatio <= 1 ? 1 : clamp(1 - (holdingRatio - 1) / 2, 0, 1);

  const points =
    maxPoints * (overrunShare * (1 - overrunRatio) + asymmetryShare * asymmetryScore);

  const deductions: Deduction[] = [];

  const overrunLost = round(maxPoints * overrunShare * overrunRatio, 2);
  if (overrunLost > 0) {
    deductions.push({
      reason: `Losses worse than ${formatR(settings.exitOverrunR)}`,
      tradeIds: overruns.map((trade) => trade.id),
      pointsLost: overrunLost,
    });
  }

  const asymmetryLost = round(maxPoints * asymmetryShare * (1 - asymmetryScore), 2);
  if (asymmetryLost > 0) {
    deductions.push({
      reason: 'Losers held longer than winners',
      // The trades that make the median loser long: every loser held past the
      // median winner.
      tradeIds: losers
        .filter((trade) => trade.durationSeconds > medianWinner)
        .map((trade) => trade.id),
      pointsLost: asymmetryLost,
    });
  }

  return {
    key: 'exits',
    label: PILLAR_LABELS.exits,
    points: round(points, 2),
    maxPoints,
    tradeCount: trades.length,
    deductions: deductions.sort((a, b) => b.pointsLost - a.pointsLost),
  };
}

/**
 * Overtrading, 15 points: `15 × (1 − violating days ÷ active days)`.
 *
 * Choice: a day's recency weight is the mean of its trades' weights, so a
 * blow-out day last week costs more than the same day five weeks ago —
 * consistent with how every other pillar treats age.
 */
function overtradingPillar(
  trades: readonly EnrichedTrade[],
  weightOf: WeightOf,
  settings: EngineSettings,
): PillarResult {
  const maxPoints = PILLAR_MAX.overtrading;
  const byDay = new Map<string, EnrichedTrade[]>();
  for (const trade of trades) {
    const list = byDay.get(trade.dayKey);
    if (list === undefined) byDay.set(trade.dayKey, [trade]);
    else list.push(trade);
  }

  let activeWeight = 0;
  let violatingWeight = 0;
  const violatingTradeIds: string[] = [];
  let violatingDays = 0;

  for (const [, dayTrades] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dayWeight = mean(dayTrades.map(weightOf));
    activeWeight += dayWeight;
    if (dayTrades.length > settings.dailyMaxTrades) {
      violatingWeight += dayWeight;
      violatingDays += 1;
      for (const trade of dayTrades) violatingTradeIds.push(trade.id);
    }
  }

  const ratio = safeDivide(violatingWeight, activeWeight, 0);
  const pointsLost = round(maxPoints * ratio, 2);

  return {
    key: 'overtrading',
    label: PILLAR_LABELS.overtrading,
    points: round(maxPoints * (1 - ratio), 2),
    maxPoints,
    tradeCount: trades.length,
    deductions:
      pointsLost > 0
        ? [
            {
              reason: `More than ${settings.dailyMaxTrades} trades in a day · ${violatingDays} ${violatingDays === 1 ? 'day' : 'days'}`,
              tradeIds: violatingTradeIds,
              pointsLost,
            },
          ]
        : [],
  };
}

/**
 * Market Conditions, 10 points: `10 × (1 − flagged ÷ all trades)`, where a
 * flagged trade entered inside a news window or the rollover window and is not
 * tagged `news-strategy`.
 *
 * Choice: a trade that is both news and rollover is counted once, under news —
 * the pillar counts trades, not violations, and news is the louder story.
 */
function marketPillar(
  trades: readonly EnrichedTrade[],
  weightOf: WeightOf,
  settings: EngineSettings,
): PillarResult {
  return pillarFromScores(
    'market',
    trades.map((trade) => ({
      trade,
      weight: weightOf(trade),
      score: trade.marketConditionFlagged ? 0 : 1,
      reason: !trade.marketConditionFlagged
        ? null
        : trade.inNewsWindow
          ? `Entered within ${settings.newsWindowMinutes} min of high-impact USD news`
          : 'Entered in the rollover window',
    })),
  );
}

/* -------------------------------------------------------------------------
 * Scoring
 * ---------------------------------------------------------------------- */

/** All six pillars over a set of trades, with an arbitrary weighting. */
export function scorePillars(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  weightOf: WeightOf = () => 1,
): PillarResult[] {
  return [
    riskPillar(trades, weightOf, settings),
    revengePillar(trades, weightOf, settings),
    stopsPillar(trades, weightOf, settings),
    exitsPillar(trades, weightOf, settings),
    overtradingPillar(trades, weightOf, settings),
    marketPillar(trades, weightOf, settings),
  ];
}

/** Total points across pillars, 0–100. */
export function pointsFromPillars(pillars: readonly PillarResult[]): number {
  return round(sum(pillars.map((pillar) => pillar.points)), 2);
}

export interface KaratOptions {
  /** Apply the §6.1 recency weighting. Off for Proof weeks and Vault days. */
  weighted?: boolean;
  /** Override the minimum sample — Vault day ingots are engraved without one. */
  minimumTrades?: number;
  /** Window length in days. Defaults to the rolling window in settings. */
  windowDays?: number;
  /**
   * The caller has already selected the manual trades inside the window, in
   * entry order, so the filter here can be skipped.
   *
   * Only `series.ts` sets it: it walks one window across the whole history and
   * would otherwise re-filter every trade on the account once per day. It
   * changes nothing about the score — the same trades are scored either way.
   */
  preWindowed?: boolean;
}

/**
 * The Karat Score over the rolling window ending at `asOf` (CLAUDE.md §6.1).
 *
 * `trades` may be the whole account: manual filtering and the window are
 * applied here, so callers never have to remember either.
 */
export function computeKarat(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  asOfMs: number,
  options: KaratOptions = {},
): KaratResult {
  const weighted = options.weighted ?? true;
  const windowDays = options.windowDays ?? settings.rollingWindowDays;
  const minimumTrades = options.minimumTrades ?? settings.minimumTrades;
  const windowStartMs = asOfMs - windowDays * DAY_MS;

  const scored =
    options.preWindowed === true
      ? trades
      : tradesInWindow(manualTrades(trades), windowStartMs, asOfMs);
  const weightOf: WeightOf = weighted
    ? (trade) => recencyWeight(trade.openTimeMs, asOfMs, settings.recencyHalfLifeDays)
    : () => 1;

  const pillars = scorePillars(scored, settings, weightOf);
  const points = pointsFromPillars(pillars);
  const enough = scored.length >= minimumTrades;
  const karat = karatFromPoints(points);

  return {
    state: enough ? 'scored' : 'assaying',
    karat: enough ? karat : null,
    tier: enough ? tierFor(karat) : null,
    points,
    maxPoints: 100,
    tradeCount: scored.length,
    minimumTrades,
    windowStart: toIso(windowStartMs),
    windowEnd: toIso(asOfMs),
    weighted,
    pillars,
  };
}
