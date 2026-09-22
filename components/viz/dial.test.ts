import { describe, expect, it } from 'vitest';
import { TIERS } from '@/lib/engine/karat';
import {
  DIAL_END_ANGLE,
  DIAL_MAJOR_VALUES,
  DIAL_MAX,
  DIAL_MIN,
  DIAL_START_ANGLE,
  DIAL_SWEEP,
  angleForKarat,
  arcPath,
  dialAltText,
  dialTicks,
  polar,
  tierSegments,
} from './dial';

/**
 * The dial's geometry, hand-checked. A 270° scale from 0K to 24K puts 11.25°
 * on every karat, which is the arithmetic every expectation here comes from.
 */

const DEGREES_PER_KARAT = DIAL_SWEEP / (DIAL_MAX - DIAL_MIN); // 11.25

describe('angleForKarat', () => {
  it('puts 0K at the start of the arc and 24K at its end', () => {
    expect(angleForKarat(0)).toBe(-135);
    expect(angleForKarat(24)).toBe(135);
    expect(DIAL_START_ANGLE).toBe(-135);
    expect(DIAL_END_ANGLE).toBe(135);
  });

  it('puts the midpoint of the scale at 12 o’clock', () => {
    expect(angleForKarat(12)).toBe(0);
  });

  it('is linear at 11.25° a karat', () => {
    expect(angleForKarat(10)).toBeCloseTo(-135 + 10 * DEGREES_PER_KARAT, 10);
    expect(angleForKarat(18)).toBeCloseTo(67.5, 10);
    expect(angleForKarat(23.1)).toBeCloseTo(124.875, 10);
  });

  it('clamps rather than letting the hand leave the dial', () => {
    expect(angleForKarat(-5)).toBe(-135);
    expect(angleForKarat(40)).toBe(135);
    expect(angleForKarat(Number.NaN)).toBe(-135);
  });
});

describe('polar', () => {
  it('measures clockwise from 12 o’clock', () => {
    const up = polar(0, 0, 10, 0);
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(-10, 10);

    const right = polar(0, 0, 10, 90);
    expect(right.x).toBeCloseTo(10, 10);
    expect(right.y).toBeCloseTo(0, 10);

    const down = polar(0, 0, 10, 180);
    expect(down.y).toBeCloseTo(10, 10);
  });

  it('offsets from the given centre', () => {
    const point = polar(220, 220, 100, 0);
    expect(point.x).toBeCloseTo(220, 10);
    expect(point.y).toBeCloseTo(120, 10);
  });
});

describe('arcPath', () => {
  it('sets the large-arc flag only past 180°', () => {
    expect(arcPath(0, 0, 10, -135, 135)).toContain(' 1 1 ');
    expect(arcPath(0, 0, 10, 0, 90)).toContain(' 0 1 ');
  });
});

describe('tierSegments', () => {
  const segments = tierSegments();

  it('has one segment per tier, lowest first', () => {
    expect(segments).toHaveLength(TIERS.length);
    expect(segments.map((segment) => segment.min)).toEqual([0, 10, 14, 18, 22, 23.5]);
    expect(segments[0]?.label).toBe('Raw Ore');
    expect(segments[segments.length - 1]?.label).toBe('24K · Pure');
  });

  it('runs each segment from its own floor to the next tier’s', () => {
    expect(segments.map((segment) => segment.max)).toEqual([10, 14, 18, 22, 23.5, 24]);
  });

  it('maps every boundary onto the scale', () => {
    expect(segments[0]?.startAngle).toBe(-135);
    expect(segments[0]?.endAngle).toBeCloseTo(-22.5, 10); // 10K
    expect(segments[1]?.endAngle).toBeCloseTo(22.5, 10); // 14K
    expect(segments[2]?.endAngle).toBeCloseTo(67.5, 10); // 18K
    expect(segments[3]?.endAngle).toBeCloseTo(112.5, 10); // 22K
    expect(segments[4]?.endAngle).toBeCloseTo(129.375, 10); // 23.5K
    expect(segments[segments.length - 1]?.endAngle).toBe(135);
  });

  it('is contiguous and covers the whole 270° arc', () => {
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index]?.startAngle).toBeCloseTo(
        segments[index - 1]?.endAngle ?? Number.NaN,
        10,
      );
    }
    const first = segments[0];
    const last = segments[segments.length - 1];
    expect((last?.endAngle ?? 0) - (first?.startAngle ?? 0)).toBeCloseTo(DIAL_SWEEP, 10);
  });

  it('darkens from Raw Ore up to bright gold at Pure', () => {
    expect(segments[0]?.color).toBe('var(--gold-deep)');
    expect(segments[0]?.opacity).toBeLessThan(segments[1]?.opacity ?? 0);
    expect(segments[segments.length - 1]?.color).toBe('var(--gold-light)');
    expect(segments.every((segment) => segment.color.includes('gold'))).toBe(true);
  });
});

describe('dialTicks', () => {
  const ticks = dialTicks();

  it('marks every 0.25K from 0 to 24', () => {
    expect(ticks).toHaveLength(97);
    expect(ticks[0]?.value).toBe(0);
    expect(ticks[1]?.value).toBe(0.25);
    expect(ticks[ticks.length - 1]?.value).toBe(24);
  });

  it('lands exactly on the major values rather than drifting', () => {
    const majors = ticks.filter((tick) => tick.major).map((tick) => tick.value);
    expect(majors).toEqual([...DIAL_MAJOR_VALUES]);
  });

  it('gives every tick the angle of its value', () => {
    for (const tick of ticks) {
      expect(tick.angle).toBeCloseTo(angleForKarat(tick.value), 10);
    }
  });
});

describe('dialAltText', () => {
  it('reads as one sentence', () => {
    expect(dialAltText(23.1, '22K · Refined', 0.3)).toBe(
      'Karat 23.1K, 22K Refined, up 0.3K vs last week',
    );
  });

  it('says down for a fall and unchanged for a flat week', () => {
    expect(dialAltText(14, '14K · Mixed', -1.2)).toContain('down 1.2K vs last week');
    expect(dialAltText(14, '14K · Mixed', 0)).toContain('unchanged vs last week');
  });

  it('leaves the comparison out when there is no prior week', () => {
    expect(dialAltText(18.4, '18K · Solid', null)).toBe('Karat 18.4K, 18K Solid');
  });

  it('says what the assaying state means', () => {
    expect(dialAltText(null, null, null)).toContain('Assaying');
  });
});
