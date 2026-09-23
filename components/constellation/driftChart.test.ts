/** The drift chart's geometry: band, baseline, and the tarnished runs. */

import { describe, expect, it } from 'vitest';
import type { DriftPoint } from '@/lib/engine/ea';
import { DRIFT_PAD, buildDriftChart, tickStep } from './driftChart';

function point(index: number, rollingR: number, below: boolean): DriftPoint {
  return {
    index,
    tradeId: `T-${index}`,
    closeTime: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
    rollingR,
    standardErrorR: 0.1,
    lowerR: 0.1,
    upperR: 0.5,
    below,
  };
}

describe('the drift chart', () => {
  const series = [point(0, 0.3, false), point(1, 0.2, false), point(2, -0.1, true), point(3, -0.2, true), point(4, 0.3, false)];
  const chart = buildDriftChart(series, 0.3);

  it('splits the line into runs inside the band and runs under it', () => {
    expect(chart.segments.map((segment) => segment.below)).toEqual([false, true, false]);
    // The run under the band starts where the line crossed it and holds two steps.
    expect(chart.segments[1]?.d.split('L')).toHaveLength(3);
  });

  it('spans the plot from the first trade to the last', () => {
    expect(chart.segments[0]?.d.startsWith(`M${DRIFT_PAD.left},`)).toBe(true);
    expect(chart.last?.x).toBe(chart.width - DRIFT_PAD.right);
    expect(chart.last?.below).toBe(false);
    expect(chart.belowShare).toBe(0.4);
  });

  it('draws the band as one closed area and the baseline inside it', () => {
    expect(chart.bandPath.startsWith('M')).toBe(true);
    expect(chart.bandPath.endsWith('Z')).toBe(true);
    const lower = chart.yTicks.find((tick) => tick.label === '0.00R');
    expect(lower).toBeDefined();
    expect(chart.zeroY).not.toBeNull();
    // Higher R is higher on the page.
    expect(chart.baselineY).toBeLessThan(chart.zeroY ?? 0);
  });

  it('labels the first, middle and last trade dates', () => {
    expect(chart.xTicks.map((tick) => tick.label)).toEqual(['1 Jul', '3 Jul', '5 Jul']);
  });

  it('picks a tick step that gives a handful of ticks', () => {
    expect(tickStep(0.4)).toBe(0.1);
    expect(tickStep(1.2)).toBe(0.25);
    expect(tickStep(2.5)).toBe(0.5);
    expect(tickStep(40)).toBe(10);
  });

  it('draws nothing for an empty series', () => {
    const empty = buildDriftChart([], 0.3);
    expect(empty.segments).toEqual([]);
    expect(empty.bandPath).toBe('');
    expect(empty.last).toBeNull();
  });
});
