/**
 * The Purity Line's geometry (CLAUDE.md §8.4) — pure, so the tests can aim at it.
 *
 * The line is the account's equity in money. Its colour is not decoration: at
 * every point it is the rolling Karat as it read at the close of that day,
 * mapped onto the gold family — bright gold-light when the trader was
 * disciplined, a dull, desaturated alloy when they were not. Nothing here
 * decides a number; it only places the engine's numbers on a plane.
 */

/** The SVG's own coordinate space. Overlays position themselves in percent of it. */
export const PURITY_WIDTH = 1000;
export const PURITY_HEIGHT = 320;

/** Share of the value range left clear above and below the curves. */
const Y_PADDING = 0.06;

export interface PurityScale {
  x0Ms: number;
  x1Ms: number;
  yMin: number;
  yMax: number;
}

export interface PlotPoint {
  x: number;
  y: number;
}

/** Time → 0…`PURITY_WIDTH`, clamped to the plot. */
export function xForTime(ms: number, scale: PurityScale): number {
  const span = scale.x1Ms - scale.x0Ms;
  if (span <= 0) return 0;
  const t = (ms - scale.x0Ms) / span;
  return Math.min(Math.max(t, 0), 1) * PURITY_WIDTH;
}

/** Equity → 0…`PURITY_HEIGHT`, top is the highest value. */
export function yForValue(value: number, scale: PurityScale): number {
  const span = scale.yMax - scale.yMin;
  if (span <= 0) return PURITY_HEIGHT / 2;
  return (1 - (value - scale.yMin) / span) * PURITY_HEIGHT;
}

/**
 * The value domain for a set of curves, padded so no curve touches an edge.
 * One domain for every series, so switching the What-if on never moves the
 * actual line.
 */
export function valueDomain(values: readonly number[]): { yMin: number; yMax: number } {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return { yMin: 0, yMax: 1 };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const pad = (max - min || Math.abs(max) || 1) * Y_PADDING;
  return { yMin: min - pad, yMax: max + pad };
}

/** Round steps for an axis: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(span: number, targetTicks = 5): number {
  if (!(span > 0)) return 1;
  const raw = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (raw <= factor * magnitude) return factor * magnitude;
  }
  return 10 * magnitude;
}

/** Every multiple of the step inside the domain, lowest first. */
export function axisTicks(yMin: number, yMax: number, targetTicks = 5): number[] {
  const step = niceStep(yMax - yMin, targetTicks);
  const ticks: number[] = [];
  for (let value = Math.ceil(yMin / step) * step; value <= yMax; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return ticks;
}

/**
 * Thins a dense series without changing its silhouette: inside each bucket of
 * `bucketWidth` plot units it keeps the first, lowest, highest and last
 * points, in their original order. Nine trades that close inside one pixel
 * are one pixel of line either way; a spike inside it survives.
 */
export function decimate(points: readonly PlotPoint[], bucketWidth = 1): PlotPoint[] {
  if (points.length <= 2 || bucketWidth <= 0) return points.slice();
  const out: PlotPoint[] = [];
  let bucket: { index: number; point: PlotPoint }[] = [];
  let bucketKey: number | null = null;

  const flush = () => {
    if (bucket.length === 0) return;
    const keep = new Map<number, PlotPoint>();
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    let low = first;
    let high = first;
    for (const entry of bucket) {
      // SVG y grows downwards: the lowest value is the largest y.
      if (low === undefined || entry.point.y > low.point.y) low = entry;
      if (high === undefined || entry.point.y < high.point.y) high = entry;
    }
    for (const entry of [first, low, high, last]) {
      if (entry !== undefined) keep.set(entry.index, entry.point);
    }
    for (const [, point] of [...keep.entries()].sort(([a], [b]) => a - b)) out.push(point);
    bucket = [];
  };

  points.forEach((point, index) => {
    const key = Math.floor(point.x / bucketWidth);
    if (bucketKey !== null && key !== bucketKey) flush();
    bucketKey = key;
    bucket.push({ index, point });
  });
  flush();
  return out;
}

/**
 * `M x y L x y …` in whole plot units — about a pixel at any width the page
 * draws, and a third of the bytes of one decimal across seven curves. A point
 * that rounds onto the one before it adds nothing and is dropped. The same
 * bytes on every build.
 */
export function linePath(points: readonly PlotPoint[]): string {
  const parts: string[] = [];
  let previous = '';
  for (const point of points) {
    const at = `${Math.round(point.x)} ${Math.round(point.y)}`;
    if (at === previous) continue;
    parts.push(`${parts.length === 0 ? 'M' : 'L'}${at}`);
    previous = at;
  }
  return parts.join(' ');
}

/* -------------------------------------------------------------------------
 * Colour — the purity of the metal
 * ---------------------------------------------------------------------- */

type Rgb = readonly [number, number, number];

/**
 * The three anchors, all from the gold family (§9):
 *  - an alloy with most of the gold gone out of it — `--gold-deep` pulled
 *    towards `--slate` — for Raw Ore and below;
 *  - `--gold` itself at 18K, Solid;
 *  - `--gold-light` at 24K, Pure.
 */
const DULL: Rgb = [0x6e, 0x66, 0x58];
const GOLD: Rgb = [0xd4, 0xaf, 0x6a];
const BRIGHT: Rgb = [0xf3, 0xdf, 0xa8];

/** The Karat each anchor stands for. */
export const PURITY_ANCHORS = { dull: 10, gold: 18, bright: 24 } as const;

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) => Math.round(Math.min(Math.max(channel, 0), 255)).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * The line's colour at a given rolling Karat. `null` — the window still
 * assaying — is drawn in the dull alloy: not scored is not bright.
 */
export function purityColor(karat: number | null): string {
  if (karat === null || !Number.isFinite(karat)) return hex(DULL);
  if (karat <= PURITY_ANCHORS.dull) return hex(DULL);
  if (karat <= PURITY_ANCHORS.gold) {
    return hex(mix(DULL, GOLD, (karat - PURITY_ANCHORS.dull) / (PURITY_ANCHORS.gold - PURITY_ANCHORS.dull)));
  }
  if (karat >= PURITY_ANCHORS.bright) return hex(BRIGHT);
  return hex(mix(GOLD, BRIGHT, (karat - PURITY_ANCHORS.gold) / (PURITY_ANCHORS.bright - PURITY_ANCHORS.gold)));
}

export interface GradientStop {
  /** 0–1 along the plot's width. */
  offset: number;
  color: string;
}

/**
 * One gradient stop per scored day, at the instant the day's Karat was read
 * (its last millisecond). The line between two closes is lit by the Karat of
 * the day it crosses. Stops outside the plot are dropped; consecutive
 * repeats of a colour are kept, because they pin a plateau in place.
 */
export function purityStops(
  series: readonly { asOfMs: number; karat: number | null }[],
  scale: PurityScale,
): GradientStop[] {
  const stops: GradientStop[] = [];
  for (const point of series) {
    const offset = xForTime(point.asOfMs, scale) / PURITY_WIDTH;
    const previous = stops[stops.length - 1];
    if (previous !== undefined && offset <= previous.offset) continue;
    stops.push({ offset: Math.round(offset * 10_000) / 10_000, color: purityColor(point.karat) });
  }
  return stops;
}
