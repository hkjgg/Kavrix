/**
 * EA Health — Fineness (CLAUDE.md §7).
 *
 * One record per magic number: the plain performance numbers, a 0–999.9‰
 * Fineness built from four components, a drift alert, and the pairwise daily
 * P&L correlation that drives the Constellation layout (§8.8).
 *
 * §7 names the four Fineness components and their weights but not their
 * formulas. Each is defined here as *a fraction of what the EA's own baseline
 * led you to expect*, so an EA performing as advertised scores 1 and the ‰
 * scale keeps the meaning gold gives it: 999‰ is the metal behaving exactly as
 * it was assayed. Every one of those definitions is marked "Choice:", and
 * each is written out as a formula in CLAUDE.md §7.
 *
 * Stage 6 adds what the Constellation needs to explain itself: the numbers
 * behind the drift alert (standard error, the threshold it was measured
 * against) and the rolling series the drift chart draws; the Monte Carlo
 * drawdown band from the backtest; correlation over shared days only, with the
 * overlap reported; traded volume; and a summary row.
 */

import type { EnrichedTrade } from './enrich';
import type { Ea } from './types';
import {
  clamp,
  cumulative,
  maxDrawdown,
  mean,
  median,
  pearson,
  round,
  safeDivide,
  standardDeviation,
  sum,
} from './math';
import type { EngineSettings } from './settings';
import { hashNumbers, mulberry32 } from './rng';
import { dayKey } from './time';

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

export type FinenessLabel = 'Fine' | 'Standard' | 'Watch' | 'Degraded';

export interface FinenessComponents {
  /** 0.40 — recent expectancy against baseline. */
  expectancyStability: number;
  /** 0.30 — recent drawdown against the baseline period's, size-adjusted. */
  drawdownVsBaseline: number;
  /** 0.20 — share of 20-trade blocks that were profitable. */
  consistency: number;
  /** 0.10 — spread paid against the account's normal spread. */
  executionQuality: number;
}

/** The weights in §7. They sum to 1. */
export const FINENESS_WEIGHTS: FinenessComponents = {
  expectancyStability: 0.4,
  drawdownVsBaseline: 0.3,
  consistency: 0.2,
  executionQuality: 0.1,
};

export interface DriftAlert {
  /** Recent expectancy is more than `thresholdStandardErrors` SEs below baseline (§7). */
  alert: boolean;
  /** How many standard errors below baseline the recent window sits. Negative means above. */
  standardErrors: number;
  recentExpectancyR: number;
  baselineExpectancyR: number;
  recentTradeCount: number;
  /** Standard error of the recent window's mean: its SD ÷ √n. 0 when it has none. */
  standardErrorR: number;
  /** The SEs below baseline that raise the alert (the setting, default 2). */
  thresholdStandardErrors: number;
  /** Baseline − threshold × SE: the recent expectancy the alert fires under. */
  thresholdR: number;
}

/**
 * One point of the drift chart: the drift test, run after every trade from the
 * first full recent window on. The last point is the live alert.
 */
export interface DriftPoint {
  /** 0-based position of the trade in the EA's close order. */
  index: number;
  tradeId: string;
  closeTime: string;
  /** Mean R of this trade and the ones before it, `eaRecentTradeCount` in all. */
  rollingR: number;
  standardErrorR: number;
  /** Baseline − k × SE and baseline + k × SE, k = `eaDriftStandardErrors`. */
  lowerR: number;
  upperR: number;
  /** The drift alert would have fired at this trade. */
  below: boolean;
}

/**
 * The Monte Carlo drawdown band (§7, Stage 6): the drawdowns an EA trading to
 * its backtest should produce over as many trades as it has lived.
 */
export interface DrawdownBand {
  /** Simulated paths drawn. */
  paths: number;
  /** Trades per path — the EA's live trade count. */
  trades: number;
  /** Live trading days the paths are laid out over. */
  days: number;
  expectancyR: number;
  dispersionR: number;
  /** ρ: how strongly the EA's same-day trades move together, from the live history. */
  intradayCorrelation: number;
  /** 5th, 50th and 95th percentile of the simulated max drawdown, in R. Positive. */
  p05R: number;
  p50R: number;
  p95R: number;
  /** The EA's live max drawdown in R. */
  liveDrawdownR: number;
  /** Share of simulated paths whose drawdown was no worse than the live one, 0–1. */
  livePercentile: number;
  /** The live drawdown is at or under the band's 95th percentile. */
  inside: boolean;
}

export interface EaResult {
  magic: number;
  name: string;
  tradeCount: number;
  netR: number;
  netMoney: number;
  /** Gross profit ÷ gross loss, in money. `null` when the EA has never lost. */
  profitFactor: number | null;
  /** Mean R per trade. */
  expectancyR: number;
  /** Worst peak-to-trough fall of the EA's cumulative R. Positive. */
  maxDrawdownR: number;
  maxDrawdownMoney: number;
  /** Lots traded across every trade. The Constellation sizes a star by it. */
  volumeLots: number;
  recent20ExpectancyR: number;
  baselineExpectancyR: number;
  /** Where the baseline came from (§7). */
  baselineSource: 'user' | 'first-live-trades' | 'none';
  winRate: number;
  /** 0–999.9‰. `null` when the EA has too few trades to assay. */
  fineness: number | null;
  components: FinenessComponents;
  label: FinenessLabel | null;
  drift: DriftAlert;
  /** The drift test after every trade, from the first full recent window. */
  driftSeries: DriftPoint[];
  /** What the drawdown component was measured against. */
  drawdownBasis: 'monte-carlo' | 'baseline-period' | 'none';
  /** `null` unless a backtest expectancy *and* dispersion were entered. */
  drawdownBand: DrawdownBand | null;
  firstTrade: string;
  lastTrade: string;
}

export interface EaCorrelation {
  a: number;
  b: number;
  /**
   * Pearson correlation of daily net P&L over the days both EAs traded.
   * `null` when they shared fewer than `eaMinOverlapDays` days.
   */
  correlation: number | null;
  /** ≥ 0.6 — the two EAs are taking the same bet (§7). Never on too little overlap. */
  sameBet: boolean;
  /** Days on which both EAs closed a trade. */
  overlapDays: number;
  /** At least `eaMinOverlapDays` shared days: the correlation is a number. */
  enoughOverlap: boolean;
}

/** The summary row above the Constellation. */
export interface ConstellationSummary {
  eaCount: number;
  /** EAs with a Fineness (20 trades or more). */
  assayedCount: number;
  /** Mean Fineness of the assayed EAs, one decimal. `null` when none is assayed. */
  averageFineness: number | null;
  sameBetPairs: number;
  /** Magic numbers with a live drift alert, ascending. */
  driftingMagics: number[];
}

export interface ConstellationResult {
  eas: EaResult[];
  correlations: EaCorrelation[];
  summary: ConstellationSummary;
}

/* -------------------------------------------------------------------------
 * Fineness components
 * ---------------------------------------------------------------------- */

/**
 * Choice: expectancy stability is measured in **standard errors below
 * baseline**, the same statistic the drift alert uses (§7), not as a raw
 * ratio. Twenty trades is a small sample: a raw `recent ÷ baseline` would mark
 * a perfectly healthy EA down for ordinary noise, and with labels that start
 * at 995‰ every EA would read Degraded.
 *
 * An EA at or above its baseline scores 1. The score falls linearly and hits 0
 * at twice the drift threshold — so the drift alert fires exactly where this
 * component crosses 0.5.
 *
 * With no usable standard error (fewer than two recent trades, or no variance
 * at all) it falls back to the ratio, which is all the data supports.
 */
export function expectancyStability(
  recentExpectancy: number,
  baselineExpectancy: number,
  standardError: number,
  driftStandardErrors: number,
): number {
  if (standardError <= 0 || driftStandardErrors <= 0) {
    if (recentExpectancy >= baselineExpectancy) return 1;
    if (baselineExpectancy > 0) return clamp(recentExpectancy / baselineExpectancy, 0, 1);
    return 0;
  }
  const below = (baselineExpectancy - recentExpectancy) / standardError;
  if (below <= 0) return 1;
  return clamp(1 - below / (2 * driftStandardErrors), 0, 1);
}

/**
 * Choice: drawdown is judged against the EA's **own baseline period** rather
 * than an arbitrary limit, because §7 says "vs baseline" and the user only
 * ever enters an expectancy. The baseline period's worst drawdown is scaled by
 * √(n) — drawdown grows with the square root of trade count — and the live
 * period is allowed that much before the score falls.
 *
 * An EA with no live history past its baseline scores 1: nothing has been
 * observed yet, and inventing a penalty would be inventing a metric.
 */
export function drawdownVsBaseline(
  baselineR: readonly number[],
  liveR: readonly number[],
): number {
  if (baselineR.length === 0 || liveR.length === 0) return 1;
  const baselineDd = maxDrawdown(cumulative(baselineR));
  const liveDd = maxDrawdown(cumulative(liveR));
  if (liveDd === 0) return 1;
  // A floor of 1R keeps a freakishly smooth baseline from making every later
  // drawdown look catastrophic.
  const allowed =
    Math.max(baselineDd, 1) * Math.sqrt(liveR.length / baselineR.length);
  return clamp(allowed / liveDd, 0, 1);
}

/**
 * A normal draw from a uniform stream (Box–Muller). The second value of each
 * pair is discarded: one draw per call keeps the stream simple to reason about,
 * and the band is not where the engine spends its time.
 */
function normalDraw(next: () => number): number {
  const u1 = Math.max(next(), Number.MIN_VALUE);
  const u2 = next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Paths for a band over `trades`, inside the sample budget (§7, like §6.6). */
export function drawdownPathCount(trades: number, settings: EngineSettings): number {
  if (trades <= 0) return 0;
  const affordable = Math.floor(settings.eaDrawdownSampleBudget / trades);
  return Math.max(
    Math.min(settings.eaDrawdownPaths, settings.eaDrawdownMinPaths),
    Math.min(settings.eaDrawdownPaths, affordable),
  );
}

/**
 * How strongly an EA's trades on the same day move together: the intraclass
 * correlation of R within a close day, clamped to 0–0.95.
 *
 * `ρ = mean over same-day pairs of eᵢ·eⱼ ÷ mean of e²`, with `e = R − mean R`.
 * `0` when no day holds two trades.
 *
 * Choice: a backtest arrives as two numbers per trade, and says nothing about
 * how trades bunch. But an EA that takes five scalps on one bias is one bet
 * five times, and drawing its trades independently would promise it a far
 * shallower drawdown than it can have — every such EA would sit outside its
 * band for ordinary noise. How an EA bunches its trades is a property of how
 * it trades, which the live history shows; so the band borrows the *shape*
 * of the days from the live history and every *number* from the backtest.
 */
export function intradayCorrelation(
  trades: readonly { day: string; r: number }[],
): number {
  if (trades.length < 2) return 0;
  const centre = mean(trades.map((trade) => trade.r));
  const byDay = new Map<string, number[]>();
  for (const trade of trades) {
    const list = byDay.get(trade.day);
    if (list === undefined) byDay.set(trade.day, [trade.r - centre]);
    else list.push(trade.r - centre);
  }
  let crossProducts = 0;
  let pairs = 0;
  for (const residuals of byDay.values()) {
    const total = sum(residuals);
    const squares = sum(residuals.map((value) => value * value));
    crossProducts += total * total - squares;
    pairs += residuals.length * (residuals.length - 1);
  }
  const variance = mean(trades.map((trade) => (trade.r - centre) ** 2));
  if (pairs === 0 || variance === 0) return 0;
  return clamp(crossProducts / pairs / variance, 0, 0.95);
}

/**
 * Simulated max drawdowns (R, ascending) of `paths` EAs trading the live day
 * layout — `dayLayout[d]` trades on day `d`, in order — with every trade drawn
 * from N(expectancy, dispersion²) and trades on one day sharing a day shock:
 * `R = μ + σ(√ρ·z_day + √(1−ρ)·z_trade)`.
 *
 * Choice: the backtest arrives as an expectancy and a dispersion, not as its
 * trade list, so "resampling the backtest's trade distribution" can only mean
 * the distribution those two numbers define. The normal is the one that
 * assumes nothing else. It is thinner-tailed than most EAs, so if the band
 * errs it errs narrow: an EA inside it is inside it.
 *
 * Seeded from the inputs (§6.6): the same backtest, layout and ρ always
 * produce the same band.
 */
export function simulateDrawdowns(
  expectancyR: number,
  dispersionR: number,
  dayLayout: readonly number[],
  rho: number,
  paths: number,
): number[] {
  const next = mulberry32(hashNumbers([expectancyR, dispersionR, rho, paths, ...dayLayout]));
  const shared = Math.sqrt(clamp(rho, 0, 1));
  const own = Math.sqrt(1 - clamp(rho, 0, 1));
  const out = new Array<number>(paths);
  for (let path = 0; path < paths; path += 1) {
    let running = 0;
    let peak = 0;
    let worst = 0;
    for (const count of dayLayout) {
      const dayShock = shared === 0 ? 0 : shared * normalDraw(next);
      for (let i = 0; i < count; i += 1) {
        running += expectancyR + dispersionR * (dayShock + own * normalDraw(next));
        if (running > peak) peak = running;
        else if (peak - running > worst) worst = peak - running;
      }
    }
    out[path] = worst;
  }
  return out.sort((x, y) => x - y);
}

/** Type-7 quantile of an ascending list. */
function sortedQuantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
}

/**
 * The Monte Carlo drawdown band (§7): the 5th–95th percentile of the drawdowns
 * the backtest predicts over the EA's live days, and where the live drawdown
 * falls in it. `null` without a positive dispersion or any trades.
 *
 * `trades` are the EA's own, in close order. The live drawdown is measured the
 * way `maxDrawdown` measures every other drawdown in the engine — from a peak
 * of at least 0 — and so is each path.
 */
export function drawdownBand(
  expectancyR: number,
  dispersionR: number,
  trades: readonly Pick<EnrichedTrade, 'rMultiple' | 'closeTimeMs'>[],
  settings: EngineSettings,
): DrawdownBand | null {
  if (!(dispersionR > 0) || trades.length === 0) return null;
  const days = trades.map((trade) => ({ day: dayKey(trade.closeTimeMs), r: trade.rMultiple }));
  const layout: number[] = [];
  let previous: string | null = null;
  for (const { day } of days) {
    if (day === previous) layout[layout.length - 1] = (layout[layout.length - 1] ?? 0) + 1;
    else layout.push(1);
    previous = day;
  }
  const rho = round(intradayCorrelation(days), 4);
  const paths = drawdownPathCount(trades.length, settings);
  const simulated = simulateDrawdowns(expectancyR, dispersionR, layout, rho, paths);
  const live = maxDrawdown(cumulative(trades.map((trade) => trade.rMultiple)));
  let atOrUnder = 0;
  for (const value of simulated) if (value <= live) atOrUnder += 1;
  const p95 = sortedQuantile(simulated, 0.95);
  return {
    paths,
    trades: trades.length,
    days: layout.length,
    expectancyR,
    dispersionR,
    intradayCorrelation: rho,
    p05R: round(sortedQuantile(simulated, 0.05), 2),
    p50R: round(sortedQuantile(simulated, 0.5), 2),
    p95R: round(p95, 2),
    liveDrawdownR: round(live, 2),
    livePercentile: round(atOrUnder / paths, 4),
    inside: live <= p95,
  };
}

/**
 * Drawdown vs the Monte Carlo band (§7): 1 while the live drawdown is inside
 * the band — at or under its 95th percentile — then the band's edge as a
 * fraction of the live drawdown, the same shape as `drawdownVsBaseline`.
 */
export function drawdownVsBand(p95R: number, liveDrawdownR: number): number {
  if (liveDrawdownR <= 0 || liveDrawdownR <= p95R) return 1;
  return clamp(p95R / liveDrawdownR, 0, 1);
}

/**
 * The drift test (§7) run after every trade once a full recent window exists:
 * the window's mean, its standard error, and the band `baseline ± k × SE`.
 * The last point is exactly the live alert.
 */
export function driftSeries(
  trades: readonly Pick<EnrichedTrade, 'id' | 'closeTime' | 'rMultiple'>[],
  baselineR: number,
  window: number,
  standardErrors: number,
): DriftPoint[] {
  const points: DriftPoint[] = [];
  if (window < 1) return points;
  const rs = trades.map((trade) => trade.rMultiple);
  for (let end = window; end <= rs.length; end += 1) {
    const slice = rs.slice(end - window, end);
    const rolling = mean(slice);
    const se = slice.length > 1 ? standardDeviation(slice) / Math.sqrt(slice.length) : 0;
    const trade = trades[end - 1];
    if (trade === undefined) continue;
    points.push({
      index: end - 1,
      tradeId: trade.id,
      closeTime: trade.closeTime,
      rollingR: round(rolling, 3),
      standardErrorR: round(se, 3),
      lowerR: round(baselineR - standardErrors * se, 3),
      upperR: round(baselineR + standardErrors * se, 3),
      below: se > 0 && (baselineR - rolling) / se > standardErrors,
    });
  }
  return points;
}

/**
 * Choice: consistency is the share of whole 20-trade blocks that finished
 * positive, taken in chronological order. It asks "does this EA make money
 * repeatedly?" without importing a second expectancy model. A trailing partial
 * block is dropped unless it is the only one.
 */
export function consistency(rs: readonly number[], blockSize: number): number {
  if (rs.length === 0) return 0;
  const blocks: number[][] = [];
  for (let start = 0; start + blockSize <= rs.length; start += blockSize) {
    blocks.push(rs.slice(start, start + blockSize));
  }
  if (blocks.length === 0) blocks.push(rs.slice());
  const profitable = blocks.filter((block) => sum(block) > 0).length;
  return profitable / blocks.length;
}

/**
 * Choice: execution quality is the account's normal spread divided by the
 * spread this EA actually paid — an EA that fires in wide-spread conditions
 * (rollover, releases) scores below 1. Slippage is not in the data yet: the
 * connector sends the fill price, never the requested one, so measuring it
 * would mean guessing.
 */
export function executionQuality(
  eaMeanSpreadPoints: number,
  accountMedianSpreadPoints: number,
): number {
  if (eaMeanSpreadPoints <= 0 || accountMedianSpreadPoints <= 0) return 1;
  return clamp(accountMedianSpreadPoints / eaMeanSpreadPoints, 0, 1);
}

/** Weighted sum of the four components, on the 0–999.9‰ scale (§7). */
export function finenessFrom(components: FinenessComponents): number {
  const raw =
    components.expectancyStability * FINENESS_WEIGHTS.expectancyStability +
    components.drawdownVsBaseline * FINENESS_WEIGHTS.drawdownVsBaseline +
    components.consistency * FINENESS_WEIGHTS.consistency +
    components.executionQuality * FINENESS_WEIGHTS.executionQuality;
  return round(Math.min(999.9, clamp(raw, 0, 1) * 1000), 1);
}

/**
 * Fineness labels (§7).
 *
 * The bands are wide because the components are: an EA trading exactly to its
 * baseline still gives a little back on consistency and spread, so a band that
 * started at 995‰ marked healthy EAs down. 930‰ is "doing what it said it
 * would"; under 700‰ something is actually wrong.
 */
export function finenessLabel(fineness: number): FinenessLabel {
  if (fineness >= 930) return 'Fine';
  if (fineness >= 850) return 'Standard';
  if (fineness >= 700) return 'Watch';
  return 'Degraded';
}

/* -------------------------------------------------------------------------
 * Per-EA analysis
 * ---------------------------------------------------------------------- */

/** The account's normal spread: the median entry spread across every trade. */
export function accountMedianSpread(trades: readonly EnrichedTrade[]): number {
  return median(trades.map((trade) => trade.spreadPointsAtEntry));
}

function analyseEa(
  magic: number,
  name: string,
  ea: Ea | undefined,
  own: readonly EnrichedTrade[],
  accountSpread: number,
  settings: EngineSettings,
): EaResult {
  const userBaseline = ea?.baselineExpectancyR ?? null;
  const userDispersion = ea?.baselineStdDevR ?? null;
  const rs = own.map((trade) => trade.rMultiple);
  const money = own.map((trade) => trade.netProfit);

  const grossProfit = sum(money.filter((value) => value > 0));
  const grossLoss = Math.abs(sum(money.filter((value) => value < 0)));

  const recent = rs.slice(-settings.eaRecentTradeCount);
  const recentExpectancy = mean(recent);

  const baselineSlice = rs.slice(0, settings.eaBaselineTradeCount);
  const baselineSource: EaResult['baselineSource'] =
    userBaseline !== null ? 'user' : baselineSlice.length > 0 ? 'first-live-trades' : 'none';
  const baseline = userBaseline ?? (baselineSlice.length > 0 ? mean(baselineSlice) : 0);

  // Drift: how far below baseline the recent window sits, in standard errors.
  const recentSd = standardDeviation(recent);
  const standardError = recent.length > 1 ? recentSd / Math.sqrt(recent.length) : 0;
  const standardErrors =
    standardError > 0 ? (baseline - recentExpectancy) / standardError : 0;

  // Drawdown: against the Monte Carlo band when the backtest gave both an
  // expectancy and a dispersion (§7), else against the baseline period.
  const band =
    userBaseline !== null && userDispersion !== null
      ? drawdownBand(userBaseline, userDispersion, own, settings)
      : null;
  const livePastBaseline = rs.slice(settings.eaBaselineTradeCount);
  const drawdownBasis: EaResult['drawdownBasis'] =
    band !== null
      ? 'monte-carlo'
      : baselineSlice.length > 0 && livePastBaseline.length > 0
        ? 'baseline-period'
        : 'none';

  const components: FinenessComponents = {
    expectancyStability: expectancyStability(
      recentExpectancy,
      baseline,
      standardError,
      settings.eaDriftStandardErrors,
    ),
    drawdownVsBaseline:
      band !== null
        ? drawdownVsBand(band.p95R, band.liveDrawdownR)
        : drawdownVsBaseline(baselineSlice, livePastBaseline),
    consistency: consistency(rs, settings.eaConsistencyBlockTrades),
    executionQuality: executionQuality(
      mean(own.map((trade) => trade.spreadPointsAtEntry)),
      accountSpread,
    ),
  };

  // An EA with fewer trades than one consistency block has not been assayed.
  const assayable = own.length >= settings.eaConsistencyBlockTrades;
  const fineness = assayable ? finenessFrom(components) : null;

  return {
    magic,
    name,
    tradeCount: own.length,
    netR: round(sum(rs), 2),
    netMoney: round(sum(money), 2),
    profitFactor: grossLoss === 0 ? null : round(grossProfit / grossLoss, 2),
    expectancyR: round(mean(rs), 3),
    maxDrawdownR: round(maxDrawdown(cumulative(rs)), 2),
    maxDrawdownMoney: round(maxDrawdown(cumulative(money)), 2),
    volumeLots: round(sum(own.map((trade) => trade.volume)), 2),
    recent20ExpectancyR: round(recentExpectancy, 3),
    baselineExpectancyR: round(baseline, 3),
    baselineSource,
    winRate: round(safeDivide(own.filter((trade) => trade.isWin).length * 100, own.length, 0), 1),
    fineness,
    components: {
      expectancyStability: round(components.expectancyStability, 4),
      drawdownVsBaseline: round(components.drawdownVsBaseline, 4),
      consistency: round(components.consistency, 4),
      executionQuality: round(components.executionQuality, 4),
    },
    label: fineness === null ? null : finenessLabel(fineness),
    drift: {
      alert: standardErrors > settings.eaDriftStandardErrors,
      standardErrors: round(standardErrors, 2),
      recentExpectancyR: round(recentExpectancy, 3),
      baselineExpectancyR: round(baseline, 3),
      recentTradeCount: recent.length,
      standardErrorR: round(standardError, 3),
      thresholdStandardErrors: settings.eaDriftStandardErrors,
      thresholdR: round(baseline - settings.eaDriftStandardErrors * standardError, 3),
    },
    driftSeries: driftSeries(own, baseline, settings.eaRecentTradeCount, settings.eaDriftStandardErrors),
    drawdownBasis,
    drawdownBand: band,
    firstTrade: own[0]?.openTime ?? '',
    lastTrade: own[own.length - 1]?.closeTime ?? '',
  };
}

/* -------------------------------------------------------------------------
 * Correlation
 * ---------------------------------------------------------------------- */

/**
 * Pairwise Pearson correlation of daily net P&L (§7), over the days **both**
 * EAs traded.
 *
 * Choice (Stage 6, replacing Stage 2's union grid): a day one EA sat out is not
 * a 0 for it — it is a day there was no bet to compare. Filling it with zeros
 * would make two EAs that merely trade on the same calendar look related, and
 * two that trade on different ones look opposed. So each pair is measured over
 * its own shared days, the count is reported, and under `eaMinOverlapDays`
 * shared days no number is claimed at all.
 *
 * Days are keyed by **close** time: that is when the P&L lands.
 */
export function eaCorrelations(
  eaTrades: readonly EnrichedTrade[],
  magics: readonly number[],
  settings: EngineSettings,
): EaCorrelation[] {
  const dailyByMagic = new Map<number, Map<string, number>>();
  for (const magic of magics) dailyByMagic.set(magic, new Map());
  for (const trade of eaTrades) {
    const daily = dailyByMagic.get(trade.magic);
    if (daily === undefined) continue;
    const day = dayKey(trade.closeTimeMs);
    daily.set(day, (daily.get(day) ?? 0) + trade.netProfit);
  }

  const correlations: EaCorrelation[] = [];
  const ordered = [...magics].sort((a, b) => a - b);
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i];
      const b = ordered[j];
      if (a === undefined || b === undefined) continue;
      const dailyA = dailyByMagic.get(a) ?? new Map<string, number>();
      const dailyB = dailyByMagic.get(b) ?? new Map<string, number>();
      const shared = [...dailyA.keys()].filter((day) => dailyB.has(day)).sort();
      const enoughOverlap = shared.length >= settings.eaMinOverlapDays;
      const correlation = enoughOverlap
        ? round(
            pearson(
              shared.map((day) => dailyA.get(day) ?? 0),
              shared.map((day) => dailyB.get(day) ?? 0),
            ),
            3,
          )
        : null;
      correlations.push({
        a,
        b,
        correlation,
        sameBet: correlation !== null && correlation >= settings.eaSameBetCorrelation,
        overlapDays: shared.length,
        enoughOverlap,
      });
    }
  }
  // Strongest first; pairs without enough overlap last.
  return correlations.sort(
    (x, y) =>
      (y.correlation ?? -Infinity) - (x.correlation ?? -Infinity) || x.a - y.a || x.b - y.b,
  );
}

/** The summary row (Stage 6): counts and one mean, over engine results. */
export function constellationSummary(
  eas: readonly EaResult[],
  correlations: readonly EaCorrelation[],
): ConstellationSummary {
  const assayed = eas
    .map((ea) => ea.fineness)
    .filter((value): value is number => value !== null);
  return {
    eaCount: eas.length,
    assayedCount: assayed.length,
    averageFineness: assayed.length === 0 ? null : round(mean(assayed), 1),
    sameBetPairs: correlations.filter((pair) => pair.sameBet).length,
    driftingMagics: eas
      .filter((ea) => ea.drift.alert)
      .map((ea) => ea.magic)
      .sort((a, b) => a - b),
  };
}

/* -------------------------------------------------------------------------
 * Entry point
 * ---------------------------------------------------------------------- */

/** Fineness, drift and correlation for every EA in the data (§7). */
export function computeConstellation(
  trades: readonly EnrichedTrade[],
  eas: readonly Ea[],
  settings: EngineSettings,
): ConstellationResult {
  const eaTrades = trades
    .filter((trade) => !trade.isManual)
    .slice()
    .sort((a, b) => a.closeTimeMs - b.closeTimeMs || a.id.localeCompare(b.id));

  const accountSpread = accountMedianSpread(trades);
  const known = new Map(eas.map((ea) => [ea.magic, ea]));
  const magics = [...new Set(eaTrades.map((trade) => trade.magic))].sort((a, b) => a - b);

  const results = magics.map((magic) => {
    const ea = known.get(magic);
    return analyseEa(
      magic,
      ea?.name ?? `EA ${magic}`,
      ea,
      eaTrades.filter((trade) => trade.magic === magic),
      accountSpread,
      settings,
    );
  });
  const correlations = eaCorrelations(eaTrades, magics, settings);

  return {
    eas: results,
    correlations,
    summary: constellationSummary(results, correlations),
  };
}
