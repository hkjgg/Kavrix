/**
 * Wrapped (CLAUDE.md §4, §17 Stage 7) — a month of discipline, told in
 * chapters and closed with the Assay Certificate.
 *
 * Input is one month of engine output: `runEngine` as of the end of the month
 * (or of the data, for the month still running), plus the calendar the Day
 * Assay needs. Output is the list of chapters with every number they draw and
 * every sentence they print. Nothing here is a new rule — each chapter reads a
 * module the rest of the product already uses:
 *
 * | Chapter | Reads |
 * |---|---|
 * | The month's Karat | `scorePillars` over the month's own trades (below) |
 * | The purity of the month | `stats.equityCurve` and the rolling `series` |
 * | Your best window | `rankHourWindows`, `describeTrades` |
 * | What impurity cost | `computeKaratGap` |
 * | The day that defined the month | `computeReplay`, `worstTiltEpisode`, `dayStory` |
 * | Your proof | `proof` (§6.4), as it stood at the month's end |
 * | Your EAs | `constellation` (§7), as it stood at the month's end |
 * | The Assay Certificate | the Karat chapter, a trade count and a serial |
 *
 * **The month's Karat** is the §6.1 formula over the month's own manual
 * trades, **unweighted**, with the §6.1 minimum sample — the way Your Proof
 * scores a week (§6.4) and the Vault scores a day (§8.7). A month is judged as
 * a whole: recency inside it would make the first week count for less than the
 * last, and two months would stop being comparable. It is not the dial's
 * rolling 30-day score, and the page says so.
 *
 * A chapter is present only when its data is: no EA chapter without EA
 * trades, no Proof chapter while Your Proof is hidden, no Gap chapter when
 * nothing was billed, no best window without a window that made money. A month
 * with fewer manual trades than the minimum sample is `assaying` and has no
 * chapters at all.
 *
 * Copy is templates over engine numbers, formatted by `lib/format`: sentence
 * case, no exclamation marks, nothing a number did not say.
 */

import { formatKarat, formatMoney, formatR } from '@/lib/format';
import { MONTH_NAMES, monthLabel, shortDate } from '@/lib/dates';
import type { ConfidenceResult } from './confidence';
import { CONFIDENCE_LABELS, describeTrades } from './confidence';
import type { DayStory } from './dayStory';
import { dayStory } from './dayStory';
import type { EaCorrelation, FinenessLabel } from './ea';
import type { EnrichedTrade, ImpurityKind } from './enrich';
import { manualTrades } from './enrich';
import type { GapLine, KaratGapResult } from './gap';
import { computeKaratGap } from './gap';
import type { AssayResult } from './index';
import type { PillarKey } from './karat';
import { karatFromPoints, pointsFromPillars, scorePillars, tierFor } from './karat';
import { round, sum } from './math';
import type { ProofResult } from './proof';
import type { TiltEpisode } from './replay';
import { computeReplay, worstTiltEpisode } from './replay';
import { hashString } from './rng';
import { rankHourWindows } from './stats';
import { dayKey } from './time';
import type { NewsEvent } from './types';

/* -------------------------------------------------------------------------
 * Months
 * ---------------------------------------------------------------------- */

/** `YYYY-MM`. */
export type MonthKey = string;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

/** The month an instant falls in, UTC. */
export function monthOf(ms: number): MonthKey {
  return new Date(ms).toISOString().slice(0, 7);
}

/** First millisecond of the month, and first millisecond of the next. */
export function monthBounds(month: MonthKey): { startMs: number; endMs: number } {
  const match = MONTH_PATTERN.exec(month);
  if (match === null) throw new RangeError(`not a month key: ${month}`);
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return { startMs: Date.UTC(year, index, 1), endMs: Date.UTC(year, index + 1, 1) };
}

/** The month before, `2026-01` → `2025-12`. */
export function previousMonth(month: MonthKey): MonthKey {
  return monthOf(monthBounds(month).startMs - 1);
}

/**
 * The instant a month is assayed at: its last millisecond, or `asOf` when the
 * month is still running. What `runEngine` should be called with.
 */
export function monthAsOf(month: MonthKey, asOfMs: number): number {
  return Math.min(monthBounds(month).endMs - 1, asOfMs);
}

/** A month is complete once `asOf` has reached its last millisecond. */
export function isMonthComplete(month: MonthKey, asOfMs: number): boolean {
  return asOfMs >= monthBounds(month).endMs - 1;
}

/** Every month from the first manual trade's to `asOf`'s, oldest first. */
export function wrappedMonths(trades: readonly EnrichedTrade[], asOfMs: number): MonthKey[] {
  const manual = manualTrades(trades).filter((trade) => trade.openTimeMs <= asOfMs);
  const first = manual[0];
  if (first === undefined) return [];
  const months: MonthKey[] = [];
  for (let month = monthOf(first.openTimeMs); month <= monthOf(asOfMs); ) {
    months.push(month);
    month = monthOf(monthBounds(month).endMs);
  }
  return months;
}

/** The last complete month, else the running one. `null` when there is none. */
export function defaultWrappedMonth(months: readonly MonthKey[], asOfMs: number): MonthKey | null {
  const complete = months.filter((month) => isMonthComplete(month, asOfMs));
  return complete[complete.length - 1] ?? months[months.length - 1] ?? null;
}

/* -------------------------------------------------------------------------
 * The certificate's serial
 * ---------------------------------------------------------------------- */

export const DEMO_SERIAL_PREFIX = 'DEMO-';

/**
 * A certificate's serial: six digits, deterministic per account and month, so
 * the same month always prints the same number on every device.
 *
 * Demo certificates carry the `DEMO-` prefix (§2, "honest demo"). A real
 * account's serial is the same hash; Stage 8 stores it in `certificates`,
 * which is where uniqueness across accounts is enforced.
 */
export function certificateSerial(
  account: { login: number; server: string },
  month: MonthKey,
  options: { demo?: boolean } = {},
): string {
  const digits = String(hashString(`${account.server}|${account.login}|${month}`) % 1_000_000).padStart(6, '0');
  return options.demo === true ? `${DEMO_SERIAL_PREFIX}${digits}` : digits;
}

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

export interface WrappedCopy {
  /** The chapter's one idea, as a sentence. */
  headline: string;
  /** At most three supporting sentences. */
  sentences: string[];
}

export interface MonthPillar {
  key: PillarKey;
  label: string;
  points: number;
  maxPoints: number;
}

export interface KaratChapter extends WrappedCopy {
  kind: 'karat';
  karat: number;
  tier: string;
  points: number;
  pillars: MonthPillar[];
  tradeCount: number;
  tradingDays: number;
  impurityTradeCount: number;
  /** The month before, scored the same way. `null` when it held too few trades. */
  previous: { month: MonthKey; label: string; karat: number; tier: string } | null;
  /** `karat − previous.karat`, one decimal. */
  delta: number | null;
}

export interface PurityPoint {
  tradeId: string;
  /** Close time, ISO — the equity curve moves when a trade closes. */
  time: string;
  equity: number;
  isManual: boolean;
}

export interface PurityStampPoint {
  tradeId: string;
  time: string;
  equity: number;
  impurities: ImpurityKind[];
}

export interface PurityChapter extends WrappedCopy {
  kind: 'purity';
  /** The account's equity after each close in the month, EAs included. */
  points: PurityPoint[];
  /** Equity before the month's first close. */
  startEquity: number;
  endEquity: number;
  netMoney: number;
  /** The rolling 30-day Karat at the end of each day of the month. */
  karatDays: { date: string; karat: number | null }[];
  brightest: { date: string; karat: number } | null;
  dullest: { date: string; karat: number } | null;
  /** Manual trades that carried an impurity, at their close. */
  stamps: PurityStampPoint[];
}

export interface WindowHour {
  hour: number;
  tradeCount: number;
  netR: number;
}

export interface WindowTrade {
  tradeId: string;
  /** Fractional UTC hour of entry, 0–24. */
  hour: number;
  rMultiple: number;
  impure: boolean;
}

export interface WindowChapter extends WrappedCopy {
  kind: 'window';
  startHour: number;
  endHour: number;
  label: string;
  tradeCount: number;
  netR: number;
  avgR: number;
  netMoney: number;
  winRate: number;
  /** Trades in the window that carried no impurity. */
  cleanCount: number;
  /** The window's own trades, scored unweighted. */
  karat: number;
  tier: string;
  confidence: ConfidenceResult;
  tradeIds: string[];
  /** Every manual trade of the month, for the 24-hour ruler. */
  trades: WindowTrade[];
  hours: WindowHour[];
}

export interface GapChapter extends WrappedCopy {
  kind: 'gap';
  gap: KaratGapResult;
  costliest: GapLine;
}

export interface DayChapterWrapped extends WrappedCopy {
  kind: 'day';
  /** `tilt`: the month's worst tilt episode. `pure`: no tilt, so its purest day. */
  mode: 'tilt' | 'pure';
  date: string;
  story: DayStory;
  episode: TiltEpisode | null;
}

export interface ProofChapter extends WrappedCopy {
  kind: 'proof';
  proof: ProofResult;
  /** The last day the proof counts. */
  through: string;
}

export interface WrappedEa {
  magic: number;
  name: string;
  /** Trades this EA opened in the month. */
  monthTrades: number;
  monthNetR: number;
  /** Fineness at the month's end. */
  fineness: number | null;
  label: FinenessLabel | null;
  drifting: boolean;
  volumeLots: number;
  recent20ExpectancyR: number;
  baselineExpectancyR: number;
}

export interface EasChapter extends WrappedCopy {
  kind: 'eas';
  eas: WrappedEa[];
  healthiest: WrappedEa | null;
  drifting: WrappedEa[];
  sameBets: EaCorrelation[];
  correlations: EaCorrelation[];
  monthTradeCount: number;
}

export interface CertificateChapter extends WrappedCopy {
  kind: 'certificate';
  serial: string;
  demo: boolean;
  karat: number;
  tier: string;
  /** `AUGUST 2026`. */
  monthName: string;
  partial: boolean;
  /** `1–31 Aug` / `1–20 Sep`. */
  period: string;
  tradeCount: number;
  tradingDays: number;
  /** `KAVRIX ASSAY · 21.4K · SEPTEMBER 2026 · No. 000147`. */
  legend: string;
}

export type WrappedChapter =
  | KaratChapter
  | PurityChapter
  | WindowChapter
  | GapChapter
  | DayChapterWrapped
  | ProofChapter
  | EasChapter
  | CertificateChapter;

export type WrappedChapterKind = WrappedChapter['kind'];

export interface WrappedResult {
  month: MonthKey;
  /** `August 2026`. */
  label: string;
  /** The month is still running — "Month to date" everywhere, the certificate included. */
  partial: boolean;
  /** First and last day the month's data covers, `YYYY-MM-DD`. */
  from: string;
  to: string;
  state: 'scored' | 'assaying';
  tradeCount: number;
  minimumTrades: number;
  asOf: string;
  chapters: WrappedChapter[];
}

export interface WrappedInput {
  month: MonthKey;
  /** `runEngine` as of `monthAsOf(month, dataAsOf)`. */
  result: AssayResult;
  /** The calendar, for the Day Assay's releases. */
  calendar: readonly NewsEvent[];
  /** Prefix the certificate serial with `DEMO-`. */
  demo?: boolean;
}

/** The chapter order (§17 Stage 7). A chapter without data drops out; the order holds. */
export const WRAPPED_CHAPTER_ORDER: readonly WrappedChapterKind[] = [
  'karat',
  'purity',
  'window',
  'gap',
  'day',
  'proof',
  'eas',
  'certificate',
];

export const MONTH_TO_DATE = 'Month to date';

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

/** `2026-08-28` → `28 August`. */
function dayMonth(key: string): string {
  return `${Number(key.slice(8, 10))} ${MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? ''}`;
}

function clock(iso: string): string {
  return iso.slice(11, 16);
}

/** `1–31 Aug`, or `22 Jun–3 Jul` across a month boundary (never in practice). */
export function periodLabel(from: string, to: string): string {
  const a = shortDate(from);
  const b = shortDate(to);
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return from === to ? b : `${Number(from.slice(8, 10))}–${b}`;
  }
  return `${a}–${b}`;
}

/* -------------------------------------------------------------------------
 * Chapter builders
 * ---------------------------------------------------------------------- */

interface MonthContext {
  input: WrappedInput;
  label: string;
  partial: boolean;
  startMs: number;
  endMs: number;
  asOfMs: number;
  from: string;
  to: string;
  manual: EnrichedTrade[];
  currency: string;
}

function monthManualTrades(trades: readonly EnrichedTrade[], month: MonthKey, asOfMs: number): EnrichedTrade[] {
  return manualTrades(trades).filter((trade) => trade.dayKey.startsWith(month) && trade.openTimeMs <= asOfMs);
}

/** A set of trades scored as a whole — unweighted, no minimum: the caller decides that. */
function scoreWhole(trades: readonly EnrichedTrade[], settings: AssayResult['settings']) {
  const pillars = scorePillars(trades, settings);
  const points = pointsFromPillars(pillars);
  return { pillars, points, karat: karatFromPoints(points) };
}

function karatChapter(context: MonthContext): KaratChapter {
  const { input, manual } = context;
  const { settings } = input.result;
  const scored = scoreWhole(manual, settings);
  const tier = tierFor(scored.karat).label;

  const previousKey = previousMonth(input.month);
  const previousTrades = monthManualTrades(input.result.trades, previousKey, context.asOfMs);
  const previousScore =
    previousTrades.length >= settings.minimumTrades ? scoreWhole(previousTrades, settings) : null;
  const previous =
    previousScore === null
      ? null
      : {
          month: previousKey,
          label: monthLabel(previousKey),
          karat: previousScore.karat,
          tier: tierFor(previousScore.karat).label,
        };
  const delta = previous === null ? null : round(scored.karat - previous.karat, 1);

  const tradingDays = new Set(manual.map((trade) => trade.dayKey)).size;
  const impurityTradeCount = manual.filter((trade) => trade.impurities.length > 0).length;
  const previousName = MONTH_NAMES[Number(previousKey.slice(5, 7)) - 1] ?? previousKey;

  let comparison: string;
  if (previous === null) {
    comparison =
      previousTrades.length === 0
        ? `${tier}. The first month of the history, so there is no prior month to compare.`
        : `${tier}. ${previousName} held ${plural(previousTrades.length, 'manual trade')}, too few to assay against.`;
  } else if (delta === 0 || delta === null) {
    comparison = `${tier}, level with ${previousName}.`;
  } else {
    comparison = `${tier}, ${delta > 0 ? 'up' : 'down'} ${formatKarat(Math.abs(delta))} on ${previousName} (${formatKarat(previous.karat)}).`;
  }

  const pillars: MonthPillar[] = scored.pillars.map((pillar) => ({
    key: pillar.key,
    label: pillar.label,
    points: pillar.points,
    maxPoints: pillar.maxPoints,
  }));
  const weakest = pillars
    .map((pillar) => ({ pillar, lost: round(pillar.maxPoints - pillar.points, 2) }))
    .sort((a, b) => b.lost - a.lost)[0];

  return {
    kind: 'karat',
    karat: scored.karat,
    tier,
    points: scored.points,
    pillars,
    tradeCount: manual.length,
    tradingDays,
    impurityTradeCount,
    previous,
    delta,
    headline: `${context.partial ? `${context.label}, so far,` : context.label} assayed at ${formatKarat(scored.karat)}.`,
    sentences: [
      comparison,
      `${plural(manual.length, 'manual trade')} over ${plural(tradingDays, 'trading day')}; ${impurityTradeCount} of them carried an impurity.`,
      weakest === undefined || weakest.lost <= 0
        ? 'No pillar gave up a point.'
        : `${weakest.pillar.label} gave up the most, keeping ${weakest.pillar.points.toFixed(1)} of ${weakest.pillar.maxPoints} points.`,
    ],
  };
}

function purityChapter(context: MonthContext): PurityChapter | null {
  const { input, startMs, endMs, currency } = context;
  const curve = input.result.stats.equityCurve;
  const inMonth = curve.filter((point) => {
    const ms = Date.parse(point.time);
    return ms >= startMs && ms < endMs;
  });
  if (inMonth.length === 0) return null;

  const firstIndex = curve.indexOf(inMonth[0] as (typeof curve)[number]);
  const before = firstIndex > 0 ? curve[firstIndex - 1] : undefined;
  const startEquity = before?.equity ?? input.result.stats.startingEquity;
  const endEquity = inMonth[inMonth.length - 1]?.equity ?? startEquity;
  const netMoney = round(endEquity - startEquity, 2);

  const karatDays = input.result.series
    .filter((point) => point.date.startsWith(input.month))
    .map((point) => ({ date: point.date, karat: point.karat }));
  const scoredDays = karatDays.filter((day): day is { date: string; karat: number } => day.karat !== null);
  // Ties go to the earlier day: the first time the line reached it.
  const brightest = scoredDays.reduce<{ date: string; karat: number } | null>(
    (best, day) => (best === null || day.karat > best.karat ? day : best),
    null,
  );
  const dullest = scoredDays.reduce<{ date: string; karat: number } | null>(
    (worst, day) => (worst === null || day.karat < worst.karat ? day : worst),
    null,
  );

  const byId = new Map(input.result.trades.map((trade) => [trade.id, trade]));
  const stamps: PurityStampPoint[] = inMonth.flatMap((point) => {
    const trade = byId.get(point.tradeId);
    if (trade === undefined || !trade.isManual || trade.impurities.length === 0) return [];
    return [{ tradeId: point.tradeId, time: point.time, equity: point.equity, impurities: trade.impurities }];
  });

  const money = (value: number) => formatMoney(value, { currency, digits: 0 });
  const range =
    brightest === null || dullest === null
      ? 'The rolling Karat was still assaying all month, so the line carries no light yet.'
      : brightest.date === dullest.date
        ? `The rolling 30-day Karat held at ${formatKarat(brightest.karat)} all month.`
        : `Under the rolling 30-day Karat it ran dullest on ${dayMonth(dullest.date)}, at ${formatKarat(dullest.karat)}, and brightest on ${dayMonth(brightest.date)}, at ${formatKarat(brightest.karat)}.`;

  return {
    kind: 'purity',
    points: inMonth.map((point) => ({
      tradeId: point.tradeId,
      time: point.time,
      equity: point.equity,
      isManual: point.isManual,
    })),
    startEquity,
    endEquity,
    netMoney,
    karatDays,
    brightest,
    dullest,
    stamps,
    headline:
      brightest === null
        ? `Equity ran from ${money(startEquity)} to ${money(endEquity)}.`
        : `The line ran brightest on ${dayMonth(brightest.date)}.`,
    sentences: [
      `Equity went from ${money(startEquity)} to ${money(endEquity)}, ${formatMoney(netMoney, { currency, digits: 0, signed: true })}, EAs included.`,
      range,
      stamps.length === 0
        ? 'No impurity is stamped on the month.'
        : `${plural(stamps.length, 'impure trade is', 'impure trades are')} stamped where ${stamps.length === 1 ? 'it' : 'they'} closed.`,
    ],
  };
}

function windowChapter(context: MonthContext): WindowChapter | null {
  const { manual, input } = context;
  const { settings } = input.result;
  const best = rankHourWindows(manual)[0];
  // A best window that lost money is not a best window.
  if (best === undefined || best.netR <= 0) return null;

  const ids = new Set(best.tradeIds);
  const inWindow = manual.filter((trade) => ids.has(trade.id));
  const cleanCount = inWindow.filter((trade) => trade.impurities.length === 0).length;
  const scored = scoreWhole(inWindow, settings);
  const confidence = describeTrades(inWindow, { settings });

  const hours: WindowHour[] = Array.from({ length: 24 }, (_, hour) => {
    const own = manual.filter((trade) => trade.hourUtc === hour);
    return {
      hour,
      tradeCount: own.length,
      netR: round(sum(own.map((trade) => trade.rMultiple)), 2),
    };
  });
  const trades: WindowTrade[] = manual.map((trade) => ({
    tradeId: trade.id,
    hour: round((trade.openTimeMs % 86_400_000) / 3_600_000, 3),
    rMultiple: round(trade.rMultiple, 3),
    impure: trade.impurities.length > 0,
  }));

  return {
    kind: 'window',
    startHour: best.startHour,
    endHour: best.endHour,
    label: best.label,
    tradeCount: best.tradeCount,
    netR: best.netR,
    avgR: best.avgR,
    netMoney: best.netMoney,
    winRate: best.winRate,
    cleanCount,
    karat: scored.karat,
    tier: tierFor(scored.karat).label,
    confidence,
    tradeIds: best.tradeIds,
    trades,
    hours,
    headline: `Your best window was ${best.label}.`,
    sentences: [
      `${plural(best.tradeCount, 'trade')}, ${formatR(best.netR)} in total and ${formatR(best.avgR, { digits: 2 })} on average; ${cleanCount} of them clean.`,
      `Scored on their own, those trades assay at ${formatKarat(scored.karat)} · ${tierFor(scored.karat).label}.`,
      `Confidence: ${CONFIDENCE_LABELS[confidence.label]}${confidence.tentative ? ', so read it as tentative' : ''}.`,
    ],
  };
}

function gapChapter(context: MonthContext): GapChapter | null {
  const { manual, input, currency } = context;
  const gap = computeKaratGap(manual, input.result.settings, currency);
  const costliest = gap.lines[0];
  if (costliest === undefined || gap.totalCostMoney <= 0) return null;

  const money = (value: number) => formatMoney(value, { currency });
  const others = gap.lines.slice(1).map((line) => line.label);
  return {
    kind: 'gap',
    gap,
    costliest,
    headline: `${costliest.label} cost the most.`,
    sentences: [
      `Impurity cost ${money(gap.totalCostMoney)} this month, or ${formatR(-gap.totalCostR)}, across the ${plural(gap.impurityCount, 'impure trade')} that lost money.`,
      `${costliest.label} billed ${plural(costliest.tradeCount, 'trade')} for ${money(costliest.costMoney)}; ${
        others.length === 0 ? 'no other pillar billed anything' : `${listJoin(others)} billed the rest`
      }.`,
      'Each trade is billed to one pillar only.',
    ],
  };
}

function dayChapter(context: MonthContext): DayChapterWrapped | null {
  const { manual, input, currency } = context;
  const { settings } = input.result;
  const replay = computeReplay(manual, settings);
  if (replay.length === 0) return null;

  const tradesOf = (date: string) => manual.filter((trade) => trade.dayKey === date);
  const worst = worstTiltEpisode(replay);

  if (worst !== null) {
    const day = replay.find((entry) => entry.date === worst.date);
    if (day === undefined) return null;
    const story = dayStory({ day, trades: tradesOf(day.date), calendar: input.calendar, settings, currency });
    const { episode } = worst;
    const tiltCount = replay.reduce((total, entry) => total + entry.episodes.length, 0);
    return {
      kind: 'day',
      mode: 'tilt',
      date: day.date,
      story,
      episode,
      headline: `${dayMonth(day.date)} defined the month.`,
      sentences: [
        `${clock(episode.start) === clock(episode.end) ? `At ${clock(episode.start)}` : `From ${clock(episode.start)} to ${clock(episode.end)}`}, ${plural(episode.impurityTradeCount, 'impurity', 'impurities')} took the day Karat from ${formatKarat(episode.karatBefore)} to ${formatKarat(episode.karatAfter)}.`,
        episode.costMoney > 0
          ? `The Gap bills that tilt ${formatMoney(episode.costMoney, { currency })}; the day closed at ${formatKarat(day.karat)}.`
          : `The Gap bills that tilt nothing; the day closed at ${formatKarat(day.karat)}.`,
        tiltCount === 1
          ? 'It was the only tilt episode of the month.'
          : `The worst of ${plural(tiltCount, 'tilt episode')} this month.`,
      ],
    };
  }

  // No tilt: the purest day — highest day Karat, then the most trades held to
  // it, then the better result, then the earlier date.
  const purest = replay
    .slice()
    .sort(
      (a, b) =>
        b.karat - a.karat ||
        b.tradeCount - a.tradeCount ||
        b.netR - a.netR ||
        a.date.localeCompare(b.date),
    )[0];
  if (purest === undefined) return null;
  const story = dayStory({ day: purest, trades: tradesOf(purest.date), calendar: input.calendar, settings, currency });
  return {
    kind: 'day',
    mode: 'pure',
    date: purest.date,
    story,
    episode: null,
    headline: `${dayMonth(purest.date)} defined the month.`,
    sentences: [
      purest.impurityTradeCount === 0
        ? `${plural(purest.tradeCount, 'trade')}, none of them impure: the day closed at ${formatKarat(purest.karat)}.`
        : `${plural(purest.tradeCount, 'trade')}, ${purest.impurityTradeCount} impure: the day closed at ${formatKarat(purest.karat)}.`,
      'No tilt episode all month, so the purest day stands for it.',
    ],
  };
}

function proofChapter(context: MonthContext): ProofChapter | null {
  const { proof } = context.input.result;
  if (!proof.visible) return null;
  return {
    kind: 'proof',
    proof,
    through: context.to,
    headline: `Discipline paid you ${formatR(proof.differenceR)} a week.`,
    sentences: [
      `Weeks at ${proof.highKarat}K and above averaged ${formatR(proof.high.avgWeeklyR)}; weeks under ${proof.lowKarat}K, ${formatR(proof.low.avgWeeklyR)}.`,
      `${plural(proof.high.weekCount, 'disciplined week')} against ${proof.low.weekCount} impure, over the whole history through ${dayMonth(context.to)}.`,
    ],
  };
}

function easChapter(context: MonthContext): EasChapter | null {
  const { input, startMs, endMs } = context;
  const monthEa = input.result.trades.filter(
    (trade) => !trade.isManual && trade.openTimeMs >= startMs && trade.openTimeMs < endMs && trade.openTimeMs <= context.asOfMs,
  );
  if (monthEa.length === 0) return null;

  const { constellation } = input.result;
  const eas: WrappedEa[] = constellation.eas
    .map((ea) => {
      const own = monthEa.filter((trade) => trade.magic === ea.magic);
      return {
        magic: ea.magic,
        name: ea.name,
        monthTrades: own.length,
        monthNetR: round(sum(own.map((trade) => trade.rMultiple)), 2),
        fineness: ea.fineness,
        label: ea.label,
        drifting: ea.drift.alert,
        volumeLots: ea.volumeLots,
        recent20ExpectancyR: ea.recent20ExpectancyR,
        baselineExpectancyR: ea.baselineExpectancyR,
      };
    })
    .filter((ea) => ea.monthTrades > 0);

  const assayed = eas.filter((ea): ea is WrappedEa & { fineness: number } => ea.fineness !== null);
  const healthiest =
    assayed.slice().sort((a, b) => b.fineness - a.fineness || a.magic - b.magic)[0] ?? null;
  const drifting = eas.filter((ea) => ea.drifting);
  const active = new Set(eas.map((ea) => ea.magic));
  const correlations = constellation.correlations.filter((pair) => active.has(pair.a) && active.has(pair.b));
  const sameBets = correlations.filter((pair) => pair.sameBet);
  const nameOf = (magic: number) => eas.find((ea) => ea.magic === magic)?.name ?? String(magic);

  const sentences: string[] = [];
  sentences.push(
    drifting.length === 0
      ? 'None of your EAs is drifting from its baseline.'
      : drifting.length === 1 && drifting[0] !== undefined
        ? `${drifting[0].name} is drifting: its last 20 trades average ${formatR(drifting[0].recent20ExpectancyR, { digits: 2 })} against a ${formatR(drifting[0].baselineExpectancyR, { digits: 2 })} baseline.`
        : `${listJoin(drifting.map((ea) => ea.name))} are drifting from their baselines.`,
  );
  const firstBet = sameBets[0];
  sentences.push(
    firstBet === undefined
      ? 'No two EAs are taking the same bet.'
      : `${nameOf(firstBet.a)} and ${nameOf(firstBet.b)} are the same bet: their daily P&L correlates at ${(firstBet.correlation ?? 0).toFixed(2)}.`,
  );
  sentences.push(`${plural(eas.length, 'EA')} opened ${plural(monthEa.length, 'trade')} this month, outside the Karat Score.`);

  return {
    kind: 'eas',
    eas,
    healthiest,
    drifting,
    sameBets,
    correlations,
    monthTradeCount: monthEa.length,
    headline:
      healthiest === null
        ? 'No EA has traded enough to be assayed yet.'
        : `${healthiest.name} was your healthiest EA, at ${healthiest.fineness?.toFixed(1)}‰.`,
    sentences,
  };
}

function certificateChapter(context: MonthContext, karat: KaratChapter): CertificateChapter {
  const { input } = context;
  const demo = input.demo === true;
  const serial = certificateSerial(input.result.account, input.month, { demo });
  const monthName = context.label.toUpperCase();
  const legend = [
    'KAVRIX ASSAY',
    formatKarat(karat.karat),
    context.partial ? `${monthName} · ${MONTH_TO_DATE.toUpperCase()}` : monthName,
    `No. ${serial}`,
  ].join(' · ');
  return {
    kind: 'certificate',
    serial,
    demo,
    karat: karat.karat,
    tier: karat.tier,
    monthName,
    partial: context.partial,
    period: periodLabel(context.from, context.to),
    tradeCount: karat.tradeCount,
    tradingDays: karat.tradingDays,
    legend,
    headline: 'Your Assay Certificate.',
    sentences: [
      'It carries the Karat, the tier, the period and the trade count. Never money, never R.',
    ],
  };
}

/* -------------------------------------------------------------------------
 * Wrapped
 * ---------------------------------------------------------------------- */

export function buildWrapped(input: WrappedInput): WrappedResult {
  const { result, month } = input;
  const asOfMs = Date.parse(result.asOf);
  const { startMs, endMs } = monthBounds(month);
  const partial = !isMonthComplete(month, asOfMs);
  const manual = monthManualTrades(result.trades, month, asOfMs);
  const firstOpen = manualTrades(result.trades)[0]?.openTimeMs ?? startMs;
  const from = dayKey(Math.max(startMs, Math.min(firstOpen, endMs - 1)));
  const to = dayKey(Math.min(endMs - 1, asOfMs));

  const context: MonthContext = {
    input,
    label: monthLabel(month),
    partial,
    startMs,
    endMs,
    asOfMs,
    from,
    to,
    manual,
    currency: result.account.currency,
  };

  const base = {
    month,
    label: context.label,
    partial,
    from,
    to,
    tradeCount: manual.length,
    minimumTrades: result.settings.minimumTrades,
    asOf: result.asOf,
  };

  if (manual.length < result.settings.minimumTrades) {
    return { ...base, state: 'assaying', chapters: [] };
  }

  const karat = karatChapter(context);
  const chapters: (WrappedChapter | null)[] = [
    karat,
    purityChapter(context),
    windowChapter(context),
    gapChapter(context),
    dayChapter(context),
    proofChapter(context),
    easChapter(context),
    certificateChapter(context, karat),
  ];

  return {
    ...base,
    state: 'scored',
    chapters: chapters.filter((chapter): chapter is WrappedChapter => chapter !== null),
  };
}
