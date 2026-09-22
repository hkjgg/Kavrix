import { describe, expect, it } from 'vitest';
import { tierSegments } from './dial';
import {
  ARRIVAL,
  ARRIVAL_TOTAL_MS,
  DIAL_RADIUS,
  FOCUS_PULL,
  RESERVED_RING,
  RING_STAGGER_MS,
  STAGE_CENTRE,
  SUBDIAL_CLOCK_HOURS,
  SUBDIAL_ORBIT,
  SUBDIAL_RADIUS,
  angleForHour,
  beatStyle,
  ringBeat,
  subDialPlacement,
  tierArcBeat,
} from './instrument';

/**
 * The Assay Instrument's geometry and its arrival sequence (Stage 3.5).
 * Hand-checked values: the stage is 0–100 with its centre at 50/50, and the
 * sub-dials sit on a circle of radius 35.
 */

const close = (value: number, expected: number): void => {
  expect(value).toBeCloseTo(expected, 3);
};

describe('angleForHour', () => {
  it('reads a clock: 12 at the top, 3 at 90°, 6 at 180°, 9 at 270°', () => {
    expect(angleForHour(12)).toBe(0);
    expect(angleForHour(3)).toBe(90);
    expect(angleForHour(6)).toBe(180);
    expect(angleForHour(9)).toBe(270);
    expect(angleForHour(10)).toBe(300);
  });
});

describe('subDialPlacement', () => {
  it('puts the six sub-dials at 12, 2, 4, 6, 8 and 10 o’clock, in engine pillar order', () => {
    expect(SUBDIAL_CLOCK_HOURS).toEqual([12, 2, 4, 6, 8, 10]);
    expect([0, 1, 2, 3, 4, 5].map((index) => subDialPlacement(index).hour)).toEqual([
      12, 2, 4, 6, 8, 10,
    ]);
  });

  it('places 12 o’clock straight above the centre and 6 o’clock straight below', () => {
    const top = subDialPlacement(0);
    close(top.x, 50);
    close(top.y, 50 - SUBDIAL_ORBIT);

    const bottom = subDialPlacement(3);
    close(bottom.x, 50);
    close(bottom.y, 50 + SUBDIAL_ORBIT);
  });

  it('places 2 o’clock up and to the right, at 60° on the orbit', () => {
    const two = subDialPlacement(1);
    // sin 60° = 0.8660…, cos 60° = 0.5
    close(two.x, 50 + SUBDIAL_ORBIT * Math.sqrt(3) / 2);
    close(two.y, 50 - SUBDIAL_ORBIT / 2);
  });

  it('keeps every sub-dial, ring included, inside the reserved outer ring', () => {
    for (let index = 0; index < 6; index += 1) {
      const place = subDialPlacement(index);
      const distance = Math.hypot(place.x - STAGE_CENTRE, place.y - STAGE_CENTRE);
      close(distance, SUBDIAL_ORBIT);
      expect(distance + SUBDIAL_RADIUS).toBeLessThan(RESERVED_RING.inner);
      expect(distance - SUBDIAL_RADIUS).toBeGreaterThan(DIAL_RADIUS);
    }
  });

  it('engraves labels above the ring on the upper half, below it on the lower half', () => {
    expect([0, 1, 2, 3, 4, 5].map((index) => subDialPlacement(index).labelSide)).toEqual([
      'above',
      'above',
      'below',
      'below',
      'below',
      'above',
    ]);
  });

  it('opens a summary towards the instrument, never off its edge', () => {
    // 12 and 6 open right; the right-hand pair opens left; the left-hand pair right.
    expect([0, 1, 2, 3, 4, 5].map((index) => subDialPlacement(index).summarySide)).toEqual([
      'right',
      'left',
      'left',
      'right',
      'right',
      'right',
    ]);
  });

  it('runs each arm radially, from just outside the dial to just short of the ring', () => {
    for (let index = 0; index < 6; index += 1) {
      const { arm, angle } = subDialPlacement(index);
      const start = Math.hypot(arm.x1 - 50, arm.y1 - 50);
      const end = Math.hypot(arm.x2 - 50, arm.y2 - 50);
      close(start, DIAL_RADIUS + 0.6);
      close(end, SUBDIAL_ORBIT - SUBDIAL_RADIUS - 0.6);

      // Both ends on the same ray from the centre: the arm points at the pivot.
      const bearing = (x: number, y: number): number =>
        ((Math.atan2(x - 50, 50 - y) * 180) / Math.PI + 360) % 360;
      expect(bearing(arm.x1, arm.y1)).toBeCloseTo(angle, 2);
      expect(bearing(arm.x2, arm.y2)).toBeCloseTo(angle, 2);
    }
  });

  it('pulls a focused sub-dial a fixed share of the way to the centre', () => {
    const top = subDialPlacement(0);
    close(top.focusShift.x, 0);
    close(top.focusShift.y, SUBDIAL_ORBIT * FOCUS_PULL);

    const eight = subDialPlacement(4);
    close(eight.focusShift.x, (50 - eight.x) * FOCUS_PULL);
    close(eight.focusShift.y, (50 - eight.y) * FOCUS_PULL);
    expect(eight.focusShift.x).toBeGreaterThan(0);
    expect(eight.focusShift.y).toBeLessThan(0);
  });
});

describe('the arrival sequence', () => {
  it('powers on in the order the instrument is built', () => {
    const order = [
      ARRIVAL.face,
      ARRIVAL.bezelSweep,
      ARRIVAL.tiers,
      ARRIVAL.scale,
      ARRIVAL.arms,
      ARRIVAL.rings,
      ARRIVAL.hand,
    ].map((beat) => beat.delay);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });

  it('is over in about two seconds', () => {
    expect(ARRIVAL_TOTAL_MS).toBeGreaterThanOrEqual(1800);
    expect(ARRIVAL_TOTAL_MS).toBeLessThanOrEqual(2500);
    expect(ARRIVAL_TOTAL_MS).toBe(ARRIVAL.hand.delay + ARRIVAL.hand.duration);
  });

  it('staggers the sub-dial rings 60 ms apart, clockwise', () => {
    expect(RING_STAGGER_MS).toBe(60);
    expect(ringBeat(0).delay).toBe(ARRIVAL.rings.delay);
    expect(ringBeat(5).delay - ringBeat(4).delay).toBe(60);
    expect(ringBeat(3).duration).toBe(ARRIVAL.rings.duration);
  });

  it('draws the tier arcs as one continuous clockwise stroke', () => {
    const beats = tierSegments().map((segment) =>
      tierArcBeat(segment.startAngle, segment.endAngle),
    );
    const first = beats[0];
    const last = beats[beats.length - 1];
    expect(first?.delay).toBe(ARRIVAL.tiers.delay);
    for (let index = 1; index < beats.length; index += 1) {
      const previous = beats[index - 1];
      const current = beats[index];
      if (previous === undefined || current === undefined) throw new Error('missing beat');
      // Each segment starts where the one before it ended (to the millisecond).
      expect(Math.abs(current.delay - (previous.delay + previous.duration))).toBeLessThanOrEqual(1);
    }
    expect(
      Math.abs((last?.delay ?? 0) + (last?.duration ?? 0) - (ARRIVAL.tiers.delay + ARRIVAL.tiers.duration)),
    ).toBeLessThanOrEqual(1);
  });

  it('writes a beat as the two custom properties the stylesheet reads', () => {
    expect(beatStyle({ delay: 820, duration: 360 })).toEqual({ '--d': '820ms', '--t': '360ms' });
  });
});
