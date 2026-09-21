/**
 * Deterministic pseudo-randomness for the demo generator.
 *
 * mulberry32 is a 32-bit state PRNG: tiny, fast, and — the only property that
 * matters here — exactly reproducible. The same seed must give byte-identical
 * demo data forever, on any machine, so nothing in this file may reach for
 * `Math.random` or the clock.
 */

/** Raw mulberry32. Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded source of the small random choices the generator needs. */
export class Rng {
  private readonly source: () => number;
  /** Cached second value from the Box–Muller pair. */
  private spare: number | null = null;

  constructor(seed: number) {
    this.source = mulberry32(seed);
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.source();
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.source() * (max - min);
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.source() * (max - min + 1));
  }

  /** True with probability `p`. */
  bool(p: number): boolean {
    return this.source() < p;
  }

  /** Standard normal, via Box–Muller. The unused half of each pair is kept. */
  normal(): number {
    if (this.spare !== null) {
      const value = this.spare;
      this.spare = null;
      return value;
    }
    // u must be > 0 for the log.
    const u = 1 - this.source();
    const v = this.source();
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    this.spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  }

  /** Normal with mean and standard deviation. */
  gaussian(mean: number, sd: number): number {
    return mean + sd * this.normal();
  }

  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.source() * items.length)];
    if (item === undefined) {
      throw new RangeError('Rng.pick called with an empty array');
    }
    return item;
  }

  /** A Fisher–Yates shuffle of a copy, leaving the input untouched. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.source() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) continue;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }
}
