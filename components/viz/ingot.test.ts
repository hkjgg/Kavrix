import { describe, expect, it } from 'vitest';
import { TIERS } from '@/lib/engine/karat';
import {
  INGOT_BASE_Y,
  INGOT_FRONT,
  INGOT_STRIP,
  INGOT_TOP,
  MIN_STRIP_SHARE,
  TIER_KEYS,
  assayStrip,
  reflect,
  roundedPath,
  stripRect,
  tierKey,
} from './ingot';

describe('the ingot’s shape', () => {
  it('is a cast bar from slightly above: a narrower top face over a bevelled front face', () => {
    const topWidth = (INGOT_TOP[1]?.[0] ?? 0) - (INGOT_TOP[0]?.[0] ?? 0);
    const frontTop = (INGOT_FRONT[1]?.[0] ?? 0) - (INGOT_FRONT[0]?.[0] ?? 0);
    const base = (INGOT_FRONT[2]?.[0] ?? 0) - (INGOT_FRONT[3]?.[0] ?? 0);
    // 40 at the rear edge, 48 where the faces meet, 56 at the base.
    expect([topWidth, frontTop, base]).toEqual([40, 48, 56]);
    // The two faces share an edge.
    expect(INGOT_TOP[2]).toEqual(INGOT_FRONT[1]);
    expect(INGOT_TOP[3]).toEqual(INGOT_FRONT[0]);
    expect(INGOT_FRONT[2]?.[1]).toBe(INGOT_BASE_Y);
  });

  it('rounds every corner, never by more than half an edge', () => {
    // A 10 × 4 box with radius 3: the short edges allow only 2.
    expect(roundedPath([[0, 0], [10, 0], [10, 4], [0, 4]], 3)).toBe(
      'M0 2 Q0 0 3 0 L7 0 Q10 0 10 2 L10 2 Q10 4 7 4 L3 4 Q0 4 0 2 Z',
    );
    expect(roundedPath([[0, 0], [1, 1]])).toBe('');
  });

  it('mirrors a face in the shelf for its reflection', () => {
    expect(reflect(INGOT_FRONT)).toEqual([
      [8, 43],
      [56, 43],
      [60, 34],
      [4, 34],
    ]);
  });
});

describe('the metal is the Karat', () => {
  it('has one metal for each of the engine’s six tiers, purest first', () => {
    expect(TIER_KEYS).toHaveLength(TIERS.length);
    expect(TIERS.map((tier) => tierKey(tier.label))).toEqual([...TIER_KEYS]);
    expect(tierKey(null)).toBeNull();
  });
});

describe('assayStrip — the day’s P&L under the bar', () => {
  it('is jade for a profit and oxblood for a loss, linear in money against the month’s largest day', () => {
    expect(assayStrip(500, 1000)).toEqual({ direction: 'profit', share: 0.5 });
    expect(assayStrip(-250, 1000)).toEqual({ direction: 'loss', share: 0.25 });
    expect(assayStrip(-1000, 1000)).toEqual({ direction: 'loss', share: 1 });
  });

  it('never draws a day that moved as nothing, and a flat day not at all', () => {
    expect(assayStrip(1, 1000)).toEqual({ direction: 'profit', share: MIN_STRIP_SHARE });
    expect(assayStrip(0, 1000)).toEqual({ direction: 'none', share: 0 });
    expect(assayStrip(Number.NaN, 1000).direction).toBe('none');
    expect(assayStrip(100, 0).direction).toBe('none');
  });

  it('centres the strip under the bar', () => {
    // Half of the 56-unit lane is 28, set in by 14 from x = 4.
    expect(stripRect({ direction: 'profit', share: 0.5 })).toEqual({ x: 18, width: 28 });
    expect(stripRect({ direction: 'loss', share: 1 })).toEqual({ x: INGOT_STRIP.x, width: INGOT_STRIP.width });
    expect(stripRect({ direction: 'none', share: 0 })).toBeNull();
  });
});
