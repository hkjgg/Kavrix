/**
 * Deterministic pseudo-randomness for the engine's statistics.
 *
 * The bootstrap in `confidence.ts` is the only place the engine draws a random
 * number, and it may never draw a different one twice: a confidence interval
 * that moves when you refresh the page is not a confidence interval. So the
 * stream is seeded from the data it resamples, never from `Math.random` or the
 * clock, and the same account always produces the same interval — forever, on
 * any machine.
 *
 * `lib/demo/rng.ts` holds the same generator for the demo data. The duplication
 * is deliberate: the engine may not depend on the demo folder (the demo depends
 * on the engine's types), and eight lines of mulberry32 is a cheaper price than
 * that edge in the dependency graph.
 */

/** mulberry32: 32 bits of state, exactly reproducible. Floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A 32-bit hash of a list of numbers (FNV-1a over their rounded text).
 *
 * This is how a sample seeds its own bootstrap: the same set of R-multiples
 * always draws the same resamples, and two different groups draw different
 * ones rather than sharing a stream and correlating their intervals.
 */
export function hashNumbers(values: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    // Six decimals: enough that two genuinely different samples differ, and
    // coarse enough that floating-point dust cannot change a seed.
    const text = value.toFixed(6);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x2c; // A separator, so [1.5, 2] and [15, 2] cannot collide.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The same hash over a string — used to key a group's stream by its name. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
