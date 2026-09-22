/**
 * Confidence (CLAUDE.md §6.6).
 *
 * Hand-built samples throughout: the Wilson numbers below are worked out in
 * the comments, and the label boundaries are checked on both sides so a change
 * to the ladder cannot pass quietly.
 */

import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_MIN_RESAMPLES,
  BOOTSTRAP_RESAMPLES,
  benjaminiHochberg,
  bootstrapMeans,
  confidenceLabel,
  correctedLabel,
  describeSample,
  describeTrades,
  resampleCount,
  sortedPercentile,
  wilsonInterval,
} from './confidence';
import { enrichTrades } from './enrich';
import { makeTrades } from './fixtures';
import { resolveSettings } from './settings';

const settings = resolveSettings();

/** A sample whose mean is clearly above zero: ten +1R, ten +2R. */
const positive = [
  ...Array.from({ length: 10 }, () => 1),
  ...Array.from({ length: 10 }, () => 2),
];

describe('wilsonInterval', () => {
  it('matches the hand-worked interval for 8 of 10', () => {
    // p̂ = 0.8, z = 1.959964, z² = 3.84146.
    // denominator = 1 + 3.84146/10          = 1.384146
    // centre      = (0.8 + 0.192073)/1.3841 = 0.716742
    // half        = 1.959964 × √(0.016 + 0.0096037)/1.384146 = 0.226578
    const interval = wilsonInterval(8, 10);
    expect(interval.low).toBeCloseTo(0.490164, 5);
    expect(interval.high).toBeCloseTo(0.943321, 5);
  });

  it('never leaves [0, 1], even at the edges of the scale', () => {
    const all = wilsonInterval(10, 10);
    expect(all.high).toBe(1);
    expect(all.low).toBeGreaterThan(0.6);
    const none = wilsonInterval(0, 10);
    expect(none.low).toBe(0);
    expect(none.high).toBeLessThan(0.4);
  });

  it('is symmetric about a half and narrows as the sample grows', () => {
    const small = wilsonInterval(5, 10);
    const large = wilsonInterval(50, 100);
    expect(small.low + small.high).toBeCloseTo(1, 10);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it('reports nothing for an empty sample', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });
});

describe('bootstrapMeans', () => {
  it('is deterministic: the same sample resamples identically', () => {
    const a = bootstrapMeans(positive, 2_000);
    const b = bootstrapMeans(positive, 2_000);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('is deterministic across a rebuilt array with the same values', () => {
    const a = bootstrapMeans([1, 2, 3, 4], 500);
    const b = bootstrapMeans([1, 2, 3, 4].map((value) => value * 1), 500);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('gives different groups different streams', () => {
    const a = bootstrapMeans([1, 2, 3, 4], 500);
    const b = bootstrapMeans([1, 2, 3, 5], 500);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('honours an explicit seed', () => {
    const a = bootstrapMeans([1, 2, 3, 4], 200, 42);
    const b = bootstrapMeans([1, 2, 3, 4], 200, 42);
    const c = bootstrapMeans([1, 2, 3, 4], 200, 43);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('returns a sorted distribution centred on the sample mean', () => {
    const distribution = bootstrapMeans(positive, 2_000);
    expect(distribution.length).toBe(2_000);
    for (let i = 1; i < distribution.length; i += 1) {
      expect(distribution[i]).toBeGreaterThanOrEqual(distribution[i - 1] ?? 0);
    }
    // The sample mean is 1.5; every resample of a [1, 2] sample stays inside it.
    expect(sortedPercentile(distribution, 0.5)).toBeGreaterThan(1.3);
    expect(sortedPercentile(distribution, 0.5)).toBeLessThan(1.7);
    expect(sortedPercentile(distribution, 0)).toBeGreaterThanOrEqual(1);
    expect(sortedPercentile(distribution, 1)).toBeLessThanOrEqual(2);
  });

  it('has nothing to resample from an empty sample', () => {
    expect(bootstrapMeans([], 100).length).toBe(0);
    expect(bootstrapMeans([1, 2], 0).length).toBe(0);
  });
});

describe('resampleCount', () => {
  it('draws the full 2,000 for a group the product will realistically show', () => {
    expect(resampleCount(8, settings)).toBe(BOOTSTRAP_RESAMPLES);
    expect(resampleCount(200, settings)).toBe(BOOTSTRAP_RESAMPLES);
  });

  it('tapers past the budget and never below the floor', () => {
    expect(resampleCount(1_000, settings)).toBe(400);
    expect(resampleCount(10_000, settings)).toBe(BOOTSTRAP_MIN_RESAMPLES);
    expect(resampleCount(1_000_000, settings)).toBe(BOOTSTRAP_MIN_RESAMPLES);
  });

  it('is zero for an empty group', () => {
    expect(resampleCount(0, settings)).toBe(0);
  });
});

describe('confidenceLabel', () => {
  const excludes = { low: 0.4, high: 1.2 };
  const includes = { low: -0.3, high: 1.2 };

  it('is Strong only at 20 trades with a 95% interval clear of zero', () => {
    expect(confidenceLabel(20, excludes, excludes, settings)).toBe('strong');
    expect(confidenceLabel(19, excludes, excludes, settings)).toBe('moderate');
    expect(confidenceLabel(20, includes, excludes, settings)).toBe('moderate');
  });

  it('is Moderate only at 10 trades with an 80% interval clear of zero', () => {
    expect(confidenceLabel(10, includes, excludes, settings)).toBe('moderate');
    expect(confidenceLabel(9, includes, excludes, settings)).toBe('weak');
    expect(confidenceLabel(10, includes, includes, settings)).toBe('weak');
  });

  it('treats an interval touching zero as including it', () => {
    expect(confidenceLabel(50, { low: 0, high: 2 }, { low: 0, high: 2 }, settings)).toBe(
      'weak',
    );
  });
});

describe('describeSample', () => {
  it('labels a clear, well-sampled edge Strong', () => {
    const result = describeSample(positive, 20, 0, { settings });
    expect(result.n).toBe(20);
    expect(result.meanR).toBeCloseTo(1.5, 5);
    expect(result.ci95.low).toBeGreaterThan(0);
    expect(result.label).toBe('strong');
    expect(result.tentative).toBe(false);
    expect(result.winRate).toBe(100);
    expect(result.pValue).toBeLessThan(0.01);
  });

  it('labels a noisy sample Weak, however large', () => {
    const noisy = Array.from({ length: 200 }, (_, index) =>
      index % 2 === 0 ? 1 : -1,
    );
    const result = describeSample(noisy, 100, 100, { settings });
    expect(result.meanR).toBe(0);
    expect(result.label).toBe('weak');
    expect(result.tentative).toBe(true);
    expect(result.pValue).toBeGreaterThan(0.5);
  });

  it('labels a small sample Weak however clean it looks', () => {
    const result = describeSample([2, 2, 2, 2, 2], 5, 0, { settings });
    expect(result.ci95.low).toBe(2);
    expect(result.label).toBe('weak');
  });

  it('floors the p-value at what the resample count can resolve', () => {
    const result = describeSample(positive, 20, 0, { settings, resamples: 200 });
    expect(result.pValue).toBeGreaterThanOrEqual(1 / 201);
  });

  it('reports an empty group rather than dividing by zero', () => {
    const result = describeSample([], 0, 0);
    expect(result).toMatchObject({ n: 0, meanR: 0, label: 'weak', tentative: true });
  });

  it('is stable across runs', () => {
    const a = describeSample(positive, 20, 0, { settings });
    const b = describeSample(positive, 20, 0, { settings });
    expect(a).toEqual(b);
  });
});

describe('describeTrades', () => {
  it('counts wins and losses from net P&L, not from a rounded R', () => {
    const trades = enrichTrades(
      {
        trades: makeTrades([
          { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
          { openTime: '2026-03-02T09:00:00Z', netProfit: -100 },
          { openTime: '2026-03-02T10:00:00Z', netProfit: 0 },
        ]),
        modifications: [],
        calendar: [],
      },
      settings,
    );
    const result = describeTrades(trades, { settings });
    expect(result.n).toBe(3);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(1);
    // The scratch trade is neither, and the win rate is over the whole group.
    expect(result.winRate).toBeCloseTo(33.3, 1);
  });
});

describe('benjaminiHochberg', () => {
  it('matches the hand-worked step-up on five p-values', () => {
    // m = 5, α = 0.05. Thresholds k/m × α: 0.01, 0.02, 0.03, 0.04, 0.05.
    // p = 0.001 ≤ 0.01 ✓ · 0.008 ≤ 0.02 ✓ · 0.039 > 0.03 ✗
    //     0.041 > 0.04 ✗ · 0.06 > 0.05 ✗ — largest k that passes is 2.
    const result = benjaminiHochberg([0.001, 0.008, 0.039, 0.041, 0.06], 0.05);
    expect(result.rejectedCount).toBe(2);
    expect(result.rejected).toEqual([true, true, false, false, false]);
    // q = min over j ≥ i of m × p(j) / j:
    //   q(5) = 0.06 × 5/5 = 0.06
    //   q(4) = min(0.06, 0.041 × 5/4) = 0.05125
    //   q(3) = min(0.05125, 0.039 × 5/3 = 0.065) = 0.05125
    //   q(2) = min(0.05125, 0.008 × 5/2) = 0.02
    //   q(1) = min(0.02, 0.001 × 5/1) = 0.005
    expect(result.qValues[4]).toBeCloseTo(0.06, 6);
    expect(result.qValues[3]).toBeCloseTo(0.05125, 6);
    expect(result.qValues[2]).toBeCloseTo(0.05125, 6);
    expect(result.qValues[1]).toBeCloseTo(0.02, 6);
    expect(result.qValues[0]).toBeCloseTo(0.005, 6);
  });

  it('rejects everything below the largest passing rank, even a gap', () => {
    // p(3) = 0.029 ≤ 0.03, so the 0.02 — above its own 0.02 threshold only by
    // a hair, and the 0.001 below it — are all swept in by the step-up.
    const result = benjaminiHochberg([0.001, 0.025, 0.029, 0.9, 0.95], 0.05);
    expect(result.rejectedCount).toBe(3);
    expect(result.rejected).toEqual([true, true, true, false, false]);
  });

  it('is stricter than no correction at all', () => {
    // Twenty cells, one at p = 0.04: significant alone, not after correction.
    const pValues = [0.04, ...Array.from({ length: 19 }, () => 0.8)];
    const result = benjaminiHochberg(pValues, 0.05);
    expect(result.rejectedCount).toBe(0);
    expect(result.qValues[0]).toBeCloseTo(0.8, 6);
  });

  it('keeps q-values monotone in p and inside [0, 1]', () => {
    const pValues = [0.001, 0.2, 0.02, 0.9, 0.5];
    const { qValues } = benjaminiHochberg(pValues, 0.05);
    const paired = pValues
      .map((p, index) => ({ p, q: qValues[index] ?? 1 }))
      .sort((a, b) => a.p - b.p);
    for (let i = 1; i < paired.length; i += 1) {
      expect(paired[i]?.q).toBeGreaterThanOrEqual(paired[i - 1]?.q ?? 0);
      expect(paired[i]?.q).toBeLessThanOrEqual(1);
    }
  });

  it('handles an empty set', () => {
    expect(benjaminiHochberg([], 0.05)).toMatchObject({ rejectedCount: 0 });
  });
});

describe('correctedLabel', () => {
  it('drops Strong to Moderate when the correction was not survived', () => {
    expect(correctedLabel('strong', false)).toBe('moderate');
    expect(correctedLabel('strong', true)).toBe('strong');
  });

  it('leaves the other labels alone', () => {
    expect(correctedLabel('moderate', false)).toBe('moderate');
    expect(correctedLabel('weak', true)).toBe('weak');
  });
});
