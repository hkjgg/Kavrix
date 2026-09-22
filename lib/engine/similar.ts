/**
 * Similar Trades (CLAUDE.md §6.9) — "you have been here before".
 *
 * Twelve nearest neighbours of a trade, measured on **what was known when it
 * was opened**. That constraint is the whole module:
 *
 *  - Only features available at entry go into the vector. No R, no MFE/MAE, no
 *    duration, no outcome. A neighbourhood built on outcomes would predict the
 *    outcome perfectly and mean nothing.
 *  - Only trades that **closed** before the target **opened** are eligible. A
 *    trade still running at entry had not taught the trader anything yet, and a
 *    trade opened later is the future.
 *
 * The result is a neighbourhood plus a summary of how it went, with the
 * §6.6 confidence attached — twelve trades is a small sample, and the label
 * says so.
 */

import type { ConfidenceResult } from './confidence';
import { describeTrades } from './confidence';
import type { EnrichedTrade } from './enrich';
import { mean, round, safeDivide, standardDeviation, sum } from './math';
import type { EngineSettings } from './settings';
import { HOUR_MS, MINUTE_MS, fractionalHourOfDay } from './time';

/* -------------------------------------------------------------------------
 * Entry volatility
 * ---------------------------------------------------------------------- */

/**
 * How fast the market was moving when each trade was opened.
 *
 * The engine holds no price bars — only the prices its own trades were opened
 * at (§13 stores deals, not ticks). So volatility at entry is measured from
 * the price path those entries trace: the standard deviation of the per-hour
 * price change between the previous `lookback` trade openings, all of which
 * had already happened when this trade was opened.
 *
 * It is a coarse measure and it is honest about what it is: a number derived
 * from data the trader could have had, never from the trade's own outcome.
 */
export function entryVolatilities(
  trades: readonly EnrichedTrade[],
  lookback: number,
): Map<string, number> {
  const ordered = trades
    .slice()
    .sort((a, b) => a.openTimeMs - b.openTimeMs || a.id.localeCompare(b.id));

  const out = new Map<string, number>();
  const rates: number[] = [];
  let previous: EnrichedTrade | null = null;

  for (const trade of ordered) {
    // Everything in `rates` was printed before this trade opened.
    out.set(
      trade.id,
      rates.length < 2 ? 0 : round(standardDeviation(rates.slice(-lookback)), 5),
    );
    if (previous !== null) {
      const hours = Math.max((trade.openTimeMs - previous.openTimeMs) / HOUR_MS, 1 / 60);
      rates.push((trade.openPrice - previous.openPrice) / hours);
      if (rates.length > lookback * 2) rates.splice(0, rates.length - lookback * 2);
    }
    previous = trade;
  }

  return out;
}

/* -------------------------------------------------------------------------
 * Features
 * ---------------------------------------------------------------------- */

/** The order the feature vector is built in — the UI reads the same labels. */
export const SIMILAR_FEATURES = [
  'hourSin',
  'hourCos',
  'weekdaySin',
  'weekdayCos',
  'asia',
  'london',
  'newYork',
  'newsProximity',
  'inNewsWindow',
  'previousResult',
  'riskPercent',
  'direction',
  'volatility',
] as const;

export type SimilarFeature = (typeof SIMILAR_FEATURES)[number];

/** How far from a release still carries information; past it, all the same. */
const NEWS_FEATURE_CAP_MINUTES = 240;

/**
 * The entry-time feature vector.
 *
 * The clock is encoded on a circle (sine and cosine) rather than as a number,
 * so 23:00 and 01:00 are two hours apart instead of twenty-two. The same for
 * the weekday.
 */
export function featureVector(
  trade: EnrichedTrade,
  volatility: number,
): number[] {
  const hourAngle = (2 * Math.PI * fractionalHourOfDay(trade.openTimeMs)) / 24;
  const weekdayAngle = (2 * Math.PI * trade.weekdayUtc) / 7;
  const proximity = Math.min(
    trade.newsProximityMinutes ?? NEWS_FEATURE_CAP_MINUTES,
    NEWS_FEATURE_CAP_MINUTES,
  );
  const previousResult =
    trade.previousTradeId === null ? 0 : trade.previousWasLoss ? -1 : 1;

  return [
    Math.sin(hourAngle),
    Math.cos(hourAngle),
    Math.sin(weekdayAngle),
    Math.cos(weekdayAngle),
    trade.sessions.includes('asia') ? 1 : 0,
    trade.sessions.includes('london') ? 1 : 0,
    trade.sessions.includes('newYork') ? 1 : 0,
    proximity,
    trade.inNewsWindow ? 1 : 0,
    previousResult,
    trade.riskPercent,
    trade.direction === 'buy' ? 1 : -1,
    volatility,
  ];
}

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

export interface SimilarNeighbour {
  tradeId: string;
  /** Euclidean distance in the normalised feature space. Smaller is nearer. */
  distance: number;
  openTime: string;
  rMultiple: number;
  netProfit: number;
  isWin: boolean;
  isLoss: boolean;
  /** Impurities the neighbour carried — the pattern is usually right here. */
  impurities: string[];
  /** The features that put it nearest, largest gap last. */
  matchedOn: SimilarFeature[];
}

export interface SimilarTradesResult {
  tradeId: string;
  k: number;
  /** Trades that had closed before the target opened. */
  eligibleCount: number;
  neighbours: SimilarNeighbour[];
  wins: number;
  losses: number;
  meanR: number;
  netMoney: number;
  /** Confidence over the neighbourhood (§6.6). Twelve trades is rarely Strong. */
  confidence: ConfidenceResult;
  /** One sentence, engine-written — the AI may rephrase it, never renumber it. */
  headline: string;
}

export interface SimilarOptions {
  /** Neighbours to return. Defaults to `similarNeighbours` (12). */
  k?: number;
  /** Pre-computed entry volatilities, when the caller already has them. */
  volatilities?: Map<string, number>;
}

/**
 * The `k` nearest prior trades to `target`.
 *
 * Features are z-scored over the **eligible pool** — the trades that had
 * already closed — so each dimension contributes on the same scale and no
 * future trade influences even the scaling. A feature with no variance in the
 * pool contributes nothing rather than dividing by zero.
 *
 * Ties break on the more recent trade, then on id: the same data always
 * returns the same twelve trades, in the same order.
 */
export function findSimilarTrades(
  target: EnrichedTrade,
  population: readonly EnrichedTrade[],
  settings: EngineSettings,
  options: SimilarOptions = {},
): SimilarTradesResult {
  const k = options.k ?? settings.similarNeighbours;
  const volatilities =
    options.volatilities ??
    entryVolatilities(population, settings.similarVolatilityLookback);

  // Same kind of trading: a manual trade's neighbours are manual trades, an
  // EA's are its own. Comparing a hand-placed trade to a grid bot's is not a
  // comparison.
  const eligible = population.filter(
    (trade) =>
      trade.id !== target.id &&
      trade.closeTimeMs < target.openTimeMs &&
      trade.isManual === target.isManual &&
      (target.isManual || trade.magic === target.magic),
  );

  if (eligible.length === 0) {
    return {
      tradeId: target.id,
      k,
      eligibleCount: 0,
      neighbours: [],
      wins: 0,
      losses: 0,
      meanR: 0,
      netMoney: 0,
      confidence: describeTrades([], { settings }),
      headline: 'No trade had closed before this one opened.',
    };
  }

  const vectors = eligible.map((trade) =>
    featureVector(trade, volatilities.get(trade.id) ?? 0),
  );
  const width = SIMILAR_FEATURES.length;

  const means: number[] = [];
  const deviations: number[] = [];
  for (let f = 0; f < width; f += 1) {
    const column = vectors.map((vector) => vector[f] ?? 0);
    means.push(mean(column));
    deviations.push(standardDeviation(column));
  }

  const scale = (vector: readonly number[]): number[] =>
    vector.map((value, f) => {
      const deviation = deviations[f] ?? 0;
      if (deviation === 0) return 0;
      return ((value ?? 0) - (means[f] ?? 0)) / deviation;
    });

  const targetVector = scale(
    featureVector(target, volatilities.get(target.id) ?? 0),
  );

  const scored = eligible.map((trade, index) => {
    const vector = scale(vectors[index] ?? []);
    const gaps = vector.map((value, f) => Math.abs(value - (targetVector[f] ?? 0)));
    return {
      trade,
      distance: Math.sqrt(sum(gaps.map((gap) => gap * gap))),
      gaps,
    };
  });

  scored.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.trade.openTimeMs - a.trade.openTimeMs ||
      a.trade.id.localeCompare(b.trade.id),
  );

  const nearest = scored.slice(0, k);
  const neighbours: SimilarNeighbour[] = nearest.map((entry) => ({
    tradeId: entry.trade.id,
    distance: round(entry.distance, 4),
    openTime: entry.trade.openTime,
    rMultiple: entry.trade.rMultiple,
    netProfit: entry.trade.netProfit,
    isWin: entry.trade.isWin,
    isLoss: entry.trade.isLoss,
    impurities: entry.trade.impurities.slice(),
    matchedOn: SIMILAR_FEATURES.map((feature, f) => ({
      feature,
      gap: entry.gaps[f] ?? 0,
    }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 3)
      .map((entry_) => entry_.feature),
  }));

  const neighbourTrades = nearest.map((entry) => entry.trade);
  const wins = neighbourTrades.filter((trade) => trade.isWin).length;
  const losses = neighbourTrades.filter((trade) => trade.isLoss).length;
  const meanR = round(mean(neighbourTrades.map((trade) => trade.rMultiple)), 3);
  const confidence = describeTrades(neighbourTrades, { settings });

  return {
    tradeId: target.id,
    k,
    eligibleCount: eligible.length,
    neighbours,
    wins,
    losses,
    meanR,
    netMoney: round(sum(neighbourTrades.map((trade) => trade.netProfit)), 2),
    confidence,
    headline: `${neighbourTrades.length} earlier trades opened in conditions like this one: ${wins} won, ${losses} lost, ${meanR >= 0 ? '+' : '−'}${Math.abs(meanR).toFixed(2)}R on average.`,
  };
}

/** Minutes between two trades — used by the report's similar-trade line. */
export function minutesBetween(a: EnrichedTrade, b: EnrichedTrade): number {
  return round(safeDivide(Math.abs(a.openTimeMs - b.openTimeMs), MINUTE_MS, 0), 1);
}
