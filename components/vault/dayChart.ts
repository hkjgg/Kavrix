/**
 * The Day Assay chart's geometry — pure, so the tests can aim at it.
 *
 * x is UTC time, with the long stretches in which nothing happened folded
 * down to a narrow break, so a day with a trade at 08:00 and another at 17:00
 * does not spend most of its width on an empty afternoon. The folding is a
 * D3 polylinear scale: each stretch that holds trades (or a release near
 * them) gets width in proportion to its length, and each gap between them a
 * fixed break.
 *
 * Two y scales share the plot: the day's running P&L on the left, in money,
 * and the running day Karat on the right, 0–24K. Nothing here decides a
 * number; it places the engine's numbers.
 */

import { scaleLinear } from 'd3-scale';
import { curveStepAfter, line } from 'd3-shape';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Context either side of a trade. */
export const TRADE_PAD_MS = 20 * MINUTE;
/** A release this close to a trade is part of the story, and gets drawn. */
export const NEWS_REACH_MS = 60 * MINUTE;
export const NEWS_PAD_MS = 10 * MINUTE;
/** Stretches closer than this are one stretch; further apart, a break. */
export const MERGE_GAP_MS = 45 * MINUTE;
/** Padding around a chapter when the chart zooms to it. */
export const ZOOM_PAD_MS = 8 * MINUTE;

export const CHART = {
  height: 236,
  top: 22,
  bottom: 30,
  left: 58,
  right: 40,
  breakWidth: 14,
} as const;

export type Interval = readonly [number, number];

/** Sorted, with overlapping or near intervals (≤ `gap` apart) merged. */
export function mergeIntervals(intervals: readonly Interval[], gap = 0): Interval[] {
  const sorted = intervals
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .slice()
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && a - last[1] <= gap) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/**
 * The stretches of the day worth drawing: every trade from entry to close,
 * padded, and every release within an hour of one. Everything else is a break.
 */
export function daySegments(
  trades: readonly { entryMs: number; closeMs: number }[],
  news: readonly { ms: number }[],
): Interval[] {
  const spans: Interval[] = trades.map((trade) => [trade.entryMs - TRADE_PAD_MS, trade.closeMs + TRADE_PAD_MS]);
  for (const event of news) {
    const near = trades.some(
      (trade) => event.ms >= trade.entryMs - NEWS_REACH_MS && event.ms <= trade.closeMs + NEWS_REACH_MS,
    );
    if (near) spans.push([event.ms - NEWS_PAD_MS, event.ms + NEWS_PAD_MS]);
  }
  return mergeIntervals(spans, MERGE_GAP_MS);
}

/** The stretches that fall inside a window — the zoomed view. */
export function clipSegments(segments: readonly Interval[], lo: number, hi: number): Interval[] {
  return segments.flatMap(([a, b]) => {
    const start = Math.max(a, lo);
    const end = Math.min(b, hi);
    return end > start ? [[start, end] as const] : [];
  });
}

export interface AxisTick {
  ms: number;
  x: number;
  label: string;
}

export interface TimeAxis {
  /** Time → x, clamped to the plot. */
  x: (ms: number) => number;
  segments: Interval[];
  /** x of each break, between stretches. */
  breaks: number[];
  ticks: AxisTick[];
  x0: number;
  x1: number;
}

function clockLabel(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

/**
 * The folded time scale over `[x0, x1]`. Each stretch gets width in
 * proportion to its length; each gap between stretches gets `breakWidth`.
 */
export function timeAxis(
  segments: readonly Interval[],
  x0: number,
  x1: number,
  breakWidth: number = CHART.breakWidth,
): TimeAxis {
  const kept = segments.filter(([a, b]) => b > a);
  if (kept.length === 0) {
    return { x: () => x0, segments: [], breaks: [], ticks: [], x0, x1 };
  }
  const total = kept.reduce((sum, [a, b]) => sum + (b - a), 0);
  const drawable = Math.max(x1 - x0 - breakWidth * (kept.length - 1), 1);
  const domain: number[] = [];
  const range: number[] = [];
  const breaks: number[] = [];
  let x = x0;
  kept.forEach(([a, b], index) => {
    if (index > 0) {
      breaks.push(x + breakWidth / 2);
      x += breakWidth;
    }
    domain.push(a, b);
    range.push(x, x + ((b - a) / total) * drawable);
    x += ((b - a) / total) * drawable;
  });
  const scale = scaleLinear().domain(domain).range(range).clamp(true);

  // A tick every 30 min, 1 h, 2 h or 3 h — whichever leaves room for a label.
  const perHour = drawable / (total / HOUR);
  const step = perHour >= 110 ? HOUR / 2 : perHour >= 52 ? HOUR : perHour >= 26 ? 2 * HOUR : 3 * HOUR;
  const ticks: AxisTick[] = [];
  for (const [a, b] of kept) {
    for (let ms = Math.ceil(a / step) * step; ms <= b; ms += step) {
      const tx = scale(ms);
      const previous = ticks[ticks.length - 1];
      if (previous !== undefined && tx - previous.x < 38) continue;
      ticks.push({ ms, x: round1(tx), label: clockLabel(ms) });
    }
  }

  return { x: (ms: number) => scale(ms), segments: kept, breaks, ticks, x0, x1 };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* -------------------------------------------------------------------------
 * y
 * ---------------------------------------------------------------------- */

export function karatY(top: number, bottom: number): (karat: number) => number {
  const scale = scaleLinear().domain([0, 24]).range([bottom, top]).clamp(true);
  return (karat: number) => scale(karat);
}

/** The P&L domain: zero always in view, a little headroom either side. */
export function pnlDomain(values: readonly number[]): [number, number] {
  const finite = values.filter((value) => Number.isFinite(value));
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  if (min === max) return [-1, 1];
  // Headroom both ways, so zero never sits on the plot's edge (or on 24K).
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

export function pnlY(domain: readonly [number, number], top: number, bottom: number) {
  const scale = scaleLinear().domain(domain).range([bottom, top]).nice(4);
  return {
    y: (value: number) => scale(value),
    ticks: scale.ticks(4),
  };
}

/* -------------------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------------- */

/**
 * The running P&L as a step line: flat at zero until the first close, then
 * stepping to each running total as its trade closes, out to the right edge.
 */
export function pnlPath(
  closes: readonly { closeMs: number; cumulative: number }[],
  x: (ms: number) => number,
  y: (value: number) => number,
  x0: number,
  x1: number,
): string {
  const points: [number, number][] = [[x0, y(0)]];
  for (const close of closes) points.push([x(close.closeMs), y(close.cumulative)]);
  const last = closes[closes.length - 1];
  points.push([x1, y(last?.cumulative ?? 0)]);
  return (
    line<[number, number]>()
      .x((point) => round1(point[0]))
      .y((point) => round1(point[1]))
      .curve(curveStepAfter)(points) ?? ''
  );
}

export interface KaratSegment {
  /** The trade this stretch of the line follows; `null` for the day's opening. */
  tradeId: string | null;
  impure: boolean;
  d: string;
}

/**
 * The running day Karat as one piece per trade, so each piece can be lit or
 * tarnished by the trade that set it: a step at the trade's entry from the
 * Karat before to the Karat after, then level to the next entry.
 */
export function karatSegments(
  steps: readonly { id: string; entryMs: number; karatBefore: number; karatAfter: number; impure: boolean }[],
  x: (ms: number) => number,
  y: (karat: number) => number,
  x0: number,
  x1: number,
): KaratSegment[] {
  const first = steps[0];
  const segments: KaratSegment[] = [
    {
      tradeId: null,
      impure: false,
      d: `M${round1(x0)} ${round1(y(first?.karatBefore ?? 24))} H${round1(first === undefined ? x1 : x(first.entryMs))}`,
    },
  ];
  steps.forEach((step, index) => {
    const at = round1(x(step.entryMs));
    const next = steps[index + 1];
    const end = round1(next === undefined ? x1 : x(next.entryMs));
    segments.push({
      tradeId: step.id,
      impure: step.impure,
      d: `M${at} ${round1(y(step.karatBefore))} V${round1(y(step.karatAfter))} H${end}`,
    });
  });
  return segments;
}

/** Stretches where impure trades were open, merged, as x ranges — the slate bands. */
export function impurityBands(
  trades: readonly { entryMs: number; closeMs: number; impure: boolean }[],
  x: (ms: number) => number,
): { x: number; width: number }[] {
  return mergeIntervals(
    trades.filter((trade) => trade.impure).map((trade) => [trade.entryMs, trade.closeMs] as const),
  ).map(([a, b]) => {
    const start = x(a);
    return { x: round1(start), width: round1(Math.max(x(b) - start, 2)) };
  });
}

/** The zoom window for a set of trades: first entry to last close, padded. */
export function zoomWindow(
  trades: readonly { entryMs: number; closeMs: number }[],
  full: Interval,
): Interval {
  if (trades.length === 0) return full;
  const lo = Math.min(...trades.map((trade) => trade.entryMs)) - ZOOM_PAD_MS;
  const hi = Math.max(...trades.map((trade) => trade.closeMs)) + ZOOM_PAD_MS;
  return [Math.max(lo, full[0]), Math.min(hi, full[1])];
}

/** Ease-out cubic, for the zoom. */
export function easeOut(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - (1 - clamped) ** 3;
}
