/**
 * Small numeric helpers shared by the engine modules.
 *
 * Nothing here knows about trading. Every function is pure, total (no throw on
 * an empty input) and returns a finite number, so an empty account cannot make
 * a metric come out as `NaN` and land in the UI.
 */

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Rounds to `digits` decimals, away from zero on a tie.
 *
 * Every number the engine puts in its output goes through this: the result is
 * JSON, and `0.30000000000000004` in a JSON payload is noise the UI would have
 * to clean up again.
 */
export function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  const rounded = Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
  // Never hand out −0: it survives arithmetic but not a JSON round trip.
  return rounded === 0 ? 0 : rounded;
}

/** Sum of a list. `0` when empty. */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/** Arithmetic mean. `0` when empty. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

/** Median. `0` when empty; the average of the middle pair for an even count. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Sample standard deviation (n − 1). `0` for fewer than two values. */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance =
    sum(values.map((value) => (value - average) ** 2)) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Pearson correlation of two equal-length series.
 *
 * Returns `0` when either series is flat (no variance) or shorter than two
 * points — undefined correlation is reported as "no relationship", never as
 * `NaN`.
 */
export function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  const meanA = mean(a.slice(0, n));
  const meanB = mean(b.slice(0, n));

  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  if (varianceA === 0 || varianceB === 0) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
}

/** `numerator / denominator`, or `fallback` when the denominator is 0. */
export function safeDivide(
  numerator: number,
  denominator: number,
  fallback = 0,
): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Largest peak-to-trough fall of a cumulative series, as a positive number.
 *
 * The series is walked in order; the running peak only ever rises, so the
 * result is the worst drawdown the account actually lived through, not the
 * worst pair of points in the list.
 */
export function maxDrawdown(cumulative: readonly number[]): number {
  let peak = 0;
  let worst = 0;
  let started = false;
  for (const value of cumulative) {
    if (!started) {
      peak = Math.max(0, value);
      started = true;
    }
    if (value > peak) peak = value;
    const fall = peak - value;
    if (fall > worst) worst = fall;
  }
  return worst;
}

/** Running totals of `values`: `[v0, v0+v1, …]`. */
export function cumulative(values: readonly number[]): number[] {
  const out: number[] = [];
  let running = 0;
  for (const value of values) {
    running += value;
    out.push(running);
  }
  return out;
}
