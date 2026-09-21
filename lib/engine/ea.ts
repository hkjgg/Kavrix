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
 * it was assayed. Every one of those definitions is marked "Choice:".
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
  /** Recent expectancy is more than `standardErrors` SEs below baseline (§7). */
  alert: boolean;
  /** How many standard errors below baseline the recent window sits. Negative means above. */
  standardErrors: number;
  recentExpectancyR: number;
  baselineExpectancyR: number;
  recentTradeCount: number;
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
  firstTrade: string;
  lastTrade: string;
}

export interface EaCorrelation {
  a: number;
  b: number;
  /** Pearson correlation of daily net P&L. */
  correlation: number;
  /** ≥ 0.6 — the two EAs are taking the same bet (§7). */
  sameBet: boolean;
  /** Days both series covered. */
  dayCount: number;
}

export interface ConstellationResult {
  eas: EaResult[];
  correlations: EaCorrelation[];
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

/** Fineness labels (§7). */
export function finenessLabel(fineness: number): FinenessLabel {
  if (fineness >= 995) return 'Fine';
  if (fineness >= 950) return 'Standard';
  if (fineness >= 900) return 'Watch';
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
  userBaseline: number | null,
  own: readonly EnrichedTrade[],
  accountSpread: number,
  settings: EngineSettings,
): EaResult {
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

  const components: FinenessComponents = {
    expectancyStability: expectancyStability(
      recentExpectancy,
      baseline,
      standardError,
      settings.eaDriftStandardErrors,
    ),
    drawdownVsBaseline: drawdownVsBaseline(
      baselineSlice,
      rs.slice(settings.eaBaselineTradeCount),
    ),
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
    },
    firstTrade: own[0]?.openTime ?? '',
    lastTrade: own[own.length - 1]?.closeTime ?? '',
  };
}

/* -------------------------------------------------------------------------
 * Correlation
 * ---------------------------------------------------------------------- */

/**
 * Pairwise Pearson correlation of daily net P&L (§7).
 *
 * Choice: the day grid is the union of every day any EA closed a trade, and a
 * day an EA sat out counts as 0 for it. "Same bet" is about firing together,
 * so a day one EA traded and the other did not is evidence, not a gap.
 * Days are keyed by **close** time: that is when the P&L lands.
 */
export function eaCorrelations(
  eaTrades: readonly EnrichedTrade[],
  magics: readonly number[],
  settings: EngineSettings,
): EaCorrelation[] {
  const days = [...new Set(eaTrades.map((trade) => dayKey(trade.closeTimeMs)))].sort();
  const dayIndex = new Map(days.map((day, index) => [day, index]));

  const seriesByMagic = new Map<number, number[]>();
  for (const magic of magics) {
    seriesByMagic.set(magic, new Array<number>(days.length).fill(0));
  }
  for (const trade of eaTrades) {
    const series = seriesByMagic.get(trade.magic);
    const index = dayIndex.get(dayKey(trade.closeTimeMs));
    if (series === undefined || index === undefined) continue;
    series[index] = (series[index] ?? 0) + trade.netProfit;
  }

  const correlations: EaCorrelation[] = [];
  const ordered = [...magics].sort((a, b) => a - b);
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i];
      const b = ordered[j];
      if (a === undefined || b === undefined) continue;
      const correlation = round(
        pearson(seriesByMagic.get(a) ?? [], seriesByMagic.get(b) ?? []),
        3,
      );
      correlations.push({
        a,
        b,
        correlation,
        sameBet: correlation >= settings.eaSameBetCorrelation,
        dayCount: days.length,
      });
    }
  }
  return correlations.sort((x, y) => y.correlation - x.correlation || x.a - y.a || x.b - y.b);
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
      ea?.baselineExpectancyR ?? null,
      eaTrades.filter((trade) => trade.magic === magic),
      accountSpread,
      settings,
    );
  });

  return {
    eas: results,
    correlations: eaCorrelations(eaTrades, magics, settings),
  };
}
