/**
 * The EA panel's drift chart (Stage 6), as geometry.
 *
 * Rolling expectancy — the mean R of the last 20 trades, after every trade —
 * against the baseline, inside the `baseline ± 2 SE` band the drift alert
 * measures. Every value is an engine `DriftPoint`; this file places them on a
 * plane. Where a point is `below` (the alert would have fired there), the line
 * is drawn tarnished.
 *
 * The band is each window's own: the SE is that window's, so the band is the
 * drift test itself run at every trade, and the last point *is* the live alert.
 */

import type { DriftPoint } from '@/lib/engine/ea';
import { formatR } from '@/lib/format';
import { shortDate } from '@/lib/dates';

export const DRIFT_WIDTH = 560;
export const DRIFT_HEIGHT = 200;
export const DRIFT_PAD = { top: 14, right: 12, bottom: 26, left: 44 } as const;

export interface DriftSegment {
  d: string;
  below: boolean;
}

export interface DriftTick {
  /** Plane units. */
  at: number;
  label: string;
}

export interface DriftChartGeometry {
  width: number;
  height: number;
  /** `baseline ± 2 SE`, as one closed area. */
  bandPath: string;
  baselineY: number;
  /** y of 0R, or `null` when 0 is outside the domain. */
  zeroY: number | null;
  /** The rolling line, split into runs inside the band and runs under it. */
  segments: DriftSegment[];
  yTicks: DriftTick[];
  xTicks: DriftTick[];
  /** The last point: the live reading. */
  last: { x: number; y: number; below: boolean } | null;
  /** Share of the plotted trades that sat under the band. */
  belowShare: number;
}

function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** A tick step from 0.1, 0.25, 0.5, 1, 2… that gives 3–6 ticks over `span`. */
export function tickStep(span: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5];
  for (const step of steps) if (span / step <= 6) return step;
  return 10;
}

export function buildDriftChart(
  series: readonly DriftPoint[],
  baselineR: number,
  size: { width?: number; height?: number } = {},
): DriftChartGeometry {
  const width = size.width ?? DRIFT_WIDTH;
  const height = size.height ?? DRIFT_HEIGHT;
  const left = DRIFT_PAD.left;
  const right = width - DRIFT_PAD.right;
  const top = DRIFT_PAD.top;
  const bottom = height - DRIFT_PAD.bottom;

  const values = [baselineR];
  for (const point of series) values.push(point.rollingR, point.lowerR, point.upperR);
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high - low < 0.2) {
    low -= 0.1;
    high += 0.1;
  }
  const padding = (high - low) * 0.06;
  low -= padding;
  high += padding;

  const y = (value: number): number =>
    round1(bottom - ((value - low) / (high - low)) * (bottom - top));
  const count = series.length;
  const x = (index: number): number =>
    round1(count <= 1 ? (left + right) / 2 : left + (index / (count - 1)) * (right - left));

  const upper = series.map((point, index) => `${x(index)},${y(point.upperR)}`);
  const lower = series.map((point, index) => `${x(index)},${y(point.lowerR)}`).reverse();
  const bandPath = count === 0 ? '' : `M${upper.join('L')}L${lower.join('L')}Z`;

  // Runs: the step into point i takes point i's state, so a fall under the
  // band is tarnished from the trade that crossed it.
  const segments: DriftSegment[] = [];
  for (let index = 1; index < count; index += 1) {
    const point = series[index];
    const previous = series[index - 1];
    if (point === undefined || previous === undefined) continue;
    const from = `${x(index - 1)},${y(previous.rollingR)}`;
    const to = `${x(index)},${y(point.rollingR)}`;
    const run = segments[segments.length - 1];
    if (run !== undefined && run.below === point.below) run.d += `L${to}`;
    else segments.push({ d: `M${from}L${to}`, below: point.below });
  }

  const step = tickStep(high - low);
  const yTicks: DriftTick[] = [];
  for (let value = Math.ceil(low / step) * step; value <= high + 1e-9; value += step) {
    const rounded = Math.round(value * 100) / 100;
    yTicks.push({ at: y(rounded), label: formatR(rounded, { digits: step < 0.5 ? 2 : 1 }) });
  }

  const xTicks: DriftTick[] = [];
  if (count > 0) {
    const picks = count === 1 ? [0] : [0, Math.round((count - 1) / 2), count - 1];
    for (const index of [...new Set(picks)]) {
      const point = series[index];
      if (point !== undefined) xTicks.push({ at: x(index), label: shortDate(point.closeTime.slice(0, 10)) });
    }
  }

  const lastPoint = series[count - 1];
  return {
    width,
    height,
    bandPath,
    baselineY: y(baselineR),
    zeroY: low <= 0 && high >= 0 ? y(0) : null,
    segments,
    yTicks,
    xTicks,
    last:
      lastPoint === undefined
        ? null
        : { x: x(count - 1), y: y(lastPoint.rollingR), below: lastPoint.below },
    belowShare: count === 0 ? 0 : series.filter((point) => point.below).length / count,
  };
}
