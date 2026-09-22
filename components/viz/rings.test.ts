import { describe, expect, it } from 'vitest';
import {
  RING_BRONZE_THRESHOLD,
  RING_GOLD_THRESHOLD,
  ringColor,
  ringRatio,
  ringTone,
} from './rings';

describe('ringRatio', () => {
  it('is the share of the pillar’s points', () => {
    expect(ringRatio(24.3, 25)).toBeCloseTo(0.972, 10);
    expect(ringRatio(9.1, 10)).toBeCloseTo(0.91, 10);
  });

  it('never leaves 0–1', () => {
    expect(ringRatio(-4, 25)).toBe(0);
    expect(ringRatio(30, 25)).toBe(1);
  });

  it('reads a pillar with no maximum as full rather than dividing by zero', () => {
    expect(ringRatio(0, 0)).toBe(1);
    expect(ringRatio(Number.NaN, 25)).toBe(1);
  });
});

describe('ringTone', () => {
  it('is gold at the threshold and above', () => {
    expect(ringTone(RING_GOLD_THRESHOLD * 25, 25)).toBe('gold');
    expect(ringTone(25, 25)).toBe('gold');
    expect(ringTone(24.3, 25)).toBe('gold');
  });

  it('is bronze from 75% up to but not including 85%', () => {
    expect(ringTone(RING_BRONZE_THRESHOLD * 20, 20)).toBe('bronze');
    expect(ringTone(0.8 * 15, 15)).toBe('bronze');
    expect(ringTone(0.8499 * 20, 20)).toBe('bronze');
  });

  it('is oxblood below 75%', () => {
    expect(ringTone(0.7499 * 20, 20)).toBe('oxblood');
    expect(ringTone(0, 15)).toBe('oxblood');
  });

  it('puts the thresholds at exactly 85% and 75%', () => {
    expect(RING_GOLD_THRESHOLD).toBe(0.85);
    expect(RING_BRONZE_THRESHOLD).toBe(0.75);
  });
});

describe('ringColor', () => {
  it('reads the colour straight off the design tokens', () => {
    expect(ringColor(25, 25)).toBe('var(--gold)');
    expect(ringColor(0.78 * 25, 25)).toBe('var(--bronze)');
    expect(ringColor(0.5 * 25, 25)).toBe('var(--oxblood)');
  });
});
