/**
 * Confidence (CLAUDE.md §6.6) — how much weight a number can carry.
 *
 * The principle Stage 2.5 exists for: with a few hundred trades, rigorous
 * statistics beat machine learning, and the product may never present a
 * pattern the data cannot support. So every group of trades the engine reports
 * — a session, an hour, an Edge Map cell, the trades behind a finding — comes
 * with the sample size, an interval around its mean R, an interval around its
 * win rate, and one of three labels.
 *
 * Nothing here knows about trading beyond "a trade has an R-multiple and
 * either won or lost". The module is a statistics library with a Kavrix
 * vocabulary.
 */

import type { EnrichedTrade } from './enrich';
import { clamp, mean, round } from './math';
import { hashNumbers, mulberry32 } from './rng';
import type { EngineSettings } from './settings';

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

/**
 * `strong`   — n ≥ 20 and the 95% interval excludes 0.
 * `moderate` — n ≥ 10 and the 80% interval excludes 0.
 * `weak`     — anything else. Weak findings stay in the data, flagged
 *              `tentative`; they never lead the Refinery (§6.6).
 */
export type ConfidenceLabel = 'strong' | 'moderate' | 'weak';

export interface Interval {
  low: number;
  high: number;
}

export interface ConfidenceResult {
  /** Trades in the group. */
  n: number;
  meanR: number;
  /** Percentile bootstrap interval around `meanR`. */
  ci95: Interval;
  /** The same bootstrap, read at the 10th and 90th percentiles. */
  ci80: Interval;
  /**
   * Two-sided bootstrap p-value for "the mean is 0", floored at `1 /
   * (resamples + 1)` — the smallest value this many resamples can resolve.
   */
  pValue: number;
  wins: number;
  losses: number;
  /** Percentage, 0–100, over the whole group (a scratch trade is neither). */
  winRate: number;
  /** Wilson score interval for the win rate, in percent. */
  winRateInterval: Interval;
  label: ConfidenceLabel;
  /** `label === 'weak'` — the UI must mark these "tentative" (§6.6). */
  tentative: boolean;
  /** Resamples actually drawn (see `resampleCount`). */
  resamples: number;
}

/** A group with nothing in it: reported, never scored. */
export const EMPTY_CONFIDENCE: ConfidenceResult = {
  n: 0,
  meanR: 0,
  ci95: { low: 0, high: 0 },
  ci80: { low: 0, high: 0 },
  pValue: 1,
  wins: 0,
  losses: 0,
  winRate: 0,
  winRateInterval: { low: 0, high: 0 },
  label: 'weak',
  tentative: true,
  resamples: 0,
};

/* -------------------------------------------------------------------------
 * Wilson
 * ---------------------------------------------------------------------- */

/** z for a two-sided 95% interval. */
export const Z_95 = 1.959963984540054;
/** z for a two-sided 80% interval. */
export const Z_80 = 1.2815515655446004;

/**
 * Wilson score interval for a proportion, as a ratio in [0, 1].
 *
 * Chosen over the textbook normal interval because a win rate is usually near
 * an edge of the scale on a small sample, where the normal interval happily
 * reports a bound above 100% or below 0%. Wilson cannot.
 */
export function wilsonInterval(
  successes: number,
  n: number,
  z: number = Z_95,
): Interval {
  if (n <= 0) return { low: 0, high: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  // Rounded at the twelfth decimal before clamping: an all-wins sample has an
  // upper bound of exactly 1, and floating-point dust must not report 99.9…%.
  return {
    low: clamp(round(centre - half, 12), 0, 1),
    high: clamp(round(centre + half, 12), 0, 1),
  };
}

/* -------------------------------------------------------------------------
 * Bootstrap
 * ---------------------------------------------------------------------- */

/** Resamples drawn for a group the product will realistically show (§6.6). */
export const BOOTSTRAP_RESAMPLES = 2_000;
/** Floor for a very large group, where the interval is already tight. */
export const BOOTSTRAP_MIN_RESAMPLES = 200;
/**
 * Observations a single group may resample in total, `resamples × n`.
 *
 * A bootstrap costs `resamples × n`, and the engine scores dozens of groups in
 * one run (24 hours, 7 weekdays, every Edge Map cell, every finding). The
 * budget keeps the whole engine inside its performance contract (§16) with the
 * full 2,000 resamples for every group up to 200 trades — which is every group
 * on an account of the size this product is built for. Past that the resample
 * count tapers, because `resamples` controls the Monte Carlo error of the
 * interval's endpoints, and by then the interval itself is narrow: a 2,000th
 * of a percentile on a 3,000-trade group is precision nobody reads.
 */
export const BOOTSTRAP_SAMPLE_BUDGET = 400_000;

/** Resamples for a group of `n` trades, under the budget above. */
export function resampleCount(n: number, settings?: EngineSettings): number {
  if (n <= 0) return 0;
  const max = settings?.bootstrapResamples ?? BOOTSTRAP_RESAMPLES;
  const min = settings?.bootstrapMinResamples ?? BOOTSTRAP_MIN_RESAMPLES;
  const budget = settings?.bootstrapSampleBudget ?? BOOTSTRAP_SAMPLE_BUDGET;
  return Math.round(clamp(Math.floor(budget / n), Math.min(min, max), max));
}

/**
 * The bootstrap distribution of the sample mean, sorted ascending.
 *
 * `resamples` draws of `n` values with replacement. The stream is seeded from
 * the sample itself (`hashNumbers`) unless a seed is given, so the same group
 * always resamples identically and two different groups never share a stream.
 */
export function bootstrapMeans(
  values: readonly number[],
  resamples: number,
  seed?: number,
): Float64Array {
  const n = values.length;
  // Nothing to resample is an empty distribution, never a run of zeroes: a
  // zero mean is a claim, and an empty group makes no claim at all.
  if (n === 0 || resamples <= 0) return new Float64Array(0);
  const out = new Float64Array(resamples);

  const sample = Float64Array.from(values);
  const next = mulberry32(seed ?? hashNumbers(values));
  for (let b = 0; b < resamples; b += 1) {
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      total += sample[(next() * n) | 0] ?? 0;
    }
    out[b] = total / n;
  }
  return out.sort();
}

/**
 * Percentile of an already-sorted distribution, by nearest rank.
 *
 * Nearest rank rather than interpolation: a bootstrap endpoint is one of the
 * resampled means, which keeps the interval inside the range the data can
 * actually produce.
 */
export function sortedPercentile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const rank = clamp(Math.ceil(q * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[rank] ?? 0;
}

/* -------------------------------------------------------------------------
 * The label
 * ---------------------------------------------------------------------- */

function excludesZero(interval: Interval): boolean {
  return interval.low > 0 || interval.high < 0;
}

/** The §6.6 ladder, applied to one group's intervals. */
export function confidenceLabel(
  n: number,
  ci95: Interval,
  ci80: Interval,
  settings?: EngineSettings,
): ConfidenceLabel {
  const strongMin = settings?.confidenceStrongMinTrades ?? 20;
  const moderateMin = settings?.confidenceModerateMinTrades ?? 10;
  if (n >= strongMin && excludesZero(ci95)) return 'strong';
  if (n >= moderateMin && excludesZero(ci80)) return 'moderate';
  return 'weak';
}

/* -------------------------------------------------------------------------
 * The entry points
 * ---------------------------------------------------------------------- */

export interface ConfidenceOptions {
  /** Force the bootstrap's seed. Leave unset to seed from the sample itself. */
  seed?: number;
  /** Override the resample count. Leave unset for the budget in §6.6. */
  resamples?: number;
  settings?: EngineSettings;
}

/**
 * Confidence for a list of R-multiples and a win count.
 *
 * `wins` and `losses` are passed in rather than read off the R values: a trade
 * is a loss when its net P&L is negative after costs (§5), which a rounded R
 * of `0.00` can hide.
 */
export function describeSample(
  rs: readonly number[],
  wins: number,
  losses: number,
  options: ConfidenceOptions = {},
): ConfidenceResult {
  const n = rs.length;
  if (n === 0) return EMPTY_CONFIDENCE;

  const resamples = options.resamples ?? resampleCount(n, options.settings);
  const distribution = bootstrapMeans(rs, resamples, options.seed);

  const ci95: Interval = {
    low: round(sortedPercentile(distribution, 0.025), 4),
    high: round(sortedPercentile(distribution, 0.975), 4),
  };
  const ci80: Interval = {
    low: round(sortedPercentile(distribution, 0.1), 4),
    high: round(sortedPercentile(distribution, 0.9), 4),
  };

  // Two-sided bootstrap p-value: how much of the resampled distribution sits
  // on the far side of 0 from the sample mean, doubled.
  let atOrBelowZero = 0;
  for (const value of distribution) if (value <= 0) atOrBelowZero += 1;
  const share = resamples === 0 ? 0.5 : atOrBelowZero / resamples;
  const pValue = clamp(
    2 * Math.min(share, 1 - share),
    resamples === 0 ? 1 : 1 / (resamples + 1),
    1,
  );

  const wilson = wilsonInterval(wins, n);
  const label = confidenceLabel(n, ci95, ci80, options.settings);

  return {
    n,
    meanR: round(mean(rs), 4),
    ci95,
    ci80,
    pValue: round(pValue, 5),
    wins,
    losses,
    winRate: round((wins / n) * 100, 1),
    winRateInterval: {
      low: round(wilson.low * 100, 1),
      high: round(wilson.high * 100, 1),
    },
    label,
    tentative: label === 'weak',
    resamples,
  };
}

/** Confidence for a group of trades — the form the rest of the engine uses. */
export function describeTrades(
  trades: readonly EnrichedTrade[],
  options: ConfidenceOptions = {},
): ConfidenceResult {
  if (trades.length === 0) return EMPTY_CONFIDENCE;
  const rs: number[] = [];
  let wins = 0;
  let losses = 0;
  for (const trade of trades) {
    rs.push(trade.rMultiple);
    if (trade.isWin) wins += 1;
    else if (trade.isLoss) losses += 1;
  }
  return describeSample(rs, wins, losses, options);
}

/** Human-readable label, for the report and (later) the UI. */
export const CONFIDENCE_LABELS: Record<ConfidenceLabel, string> = {
  strong: 'Strong',
  moderate: 'Moderate',
  weak: 'Weak',
};

/* -------------------------------------------------------------------------
 * Benjamini–Hochberg
 * ---------------------------------------------------------------------- */

export interface BenjaminiHochbergResult {
  /** Adjusted p-value (q), in the input's order. */
  qValues: number[];
  /** Whether each hypothesis is rejected at `alpha`, in the input's order. */
  rejected: boolean[];
  /** Number rejected. */
  rejectedCount: number;
  alpha: number;
}

/**
 * Benjamini–Hochberg, controlling the false discovery rate at `alpha`.
 *
 * The Edge Map tests twenty-odd cells at once. At α = 0.05, one cell in twenty
 * looks "significant" by luck alone, which is exactly the false pattern §6.6
 * forbids the product from presenting. BH is the standard correction for this
 * and, unlike Bonferroni, it does not throw away every real effect a few
 * hundred trades can show.
 *
 * Step-up: sort the p-values, find the largest `k` with `p(k) ≤ k/m × α`, and
 * reject everything at or below it. The q-values are the monotone-adjusted
 * `m/k × p(k)`.
 */
export function benjaminiHochberg(
  pValues: readonly number[],
  alpha = 0.05,
): BenjaminiHochbergResult {
  const m = pValues.length;
  if (m === 0) return { qValues: [], rejected: [], rejectedCount: 0, alpha };

  const order = pValues
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p - b.p || a.index - b.index);

  const qValues = new Array<number>(m).fill(1);
  let running = 1;
  // Walk from the largest p down, keeping the running minimum: that is what
  // makes the q-values monotone in p.
  for (let rank = m; rank >= 1; rank -= 1) {
    const entry = order[rank - 1];
    if (entry === undefined) continue;
    running = Math.min(running, (entry.p * m) / rank);
    qValues[entry.index] = clamp(round(running, 6), 0, 1);
  }

  let largestRejected = 0;
  for (let rank = 1; rank <= m; rank += 1) {
    const entry = order[rank - 1];
    if (entry === undefined) continue;
    if (entry.p <= (rank / m) * alpha) largestRejected = rank;
  }

  const rejected = new Array<boolean>(m).fill(false);
  for (let rank = 1; rank <= largestRejected; rank += 1) {
    const entry = order[rank - 1];
    if (entry !== undefined) rejected[entry.index] = true;
  }

  return { qValues, rejected, rejectedCount: largestRejected, alpha };
}

/**
 * A label after a multiple-comparison correction.
 *
 * A cell that would read Strong on its own evidence but did not survive BH is
 * not Strong: it is one of twenty cells, and one of twenty looks good by
 * accident. It drops to Moderate rather than to Weak — the sample is still
 * there, the claim is just no longer exceptional.
 */
export function correctedLabel(
  label: ConfidenceLabel,
  survivedCorrection: boolean,
): ConfidenceLabel {
  if (label === 'strong' && !survivedCorrection) return 'moderate';
  return label;
}
