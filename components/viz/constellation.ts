/**
 * The Constellation's geometry (CLAUDE.md §8.8), pure.
 *
 * EAs are stars. Their positions come from a D3 force layout in which the
 * link between two EAs wants to be `1 − correlation` long, so EAs that win and
 * lose on the same days pull together and EAs that move apart drift away.
 *
 * The simulation never runs live. It is ticked a fixed number of times
 * (300) with a seeded random source, headless, and the final positions are
 * frozen: the same data always lays out the same sky, and the browser receives
 * coordinates, not a simulation. The page renders it on the server.
 *
 * Nothing here is a metric. Correlation, volume and Fineness arrive from the
 * engine; this file only decides where on the plane they are drawn.
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { FinenessLabel } from '@/lib/engine/ea';
import { mulberry32 } from '@/lib/engine/rng';

/** The drawing plane. The chart box keeps this aspect ratio, so nothing shifts. */
export const SKY_WIDTH = 640;
export const SKY_HEIGHT = 440;

/** Ticks the layout runs before it is frozen. */
export const LAYOUT_TICKS = 300;
/** The layout's seed. Fixed: the sky is part of the data, not of the visit. */
export const LAYOUT_SEED = 0x5ca1_ab1e;

/** Link length for correlation `c`: `BASE + SPAN × (1 − c)`, in plane units. */
export const LINK_BASE = 54;
export const LINK_SPAN = 150;

/** Star core radius range, plane units. Area is proportional to volume. */
export const STAR_MIN_RADIUS = 6;
export const STAR_MAX_RADIUS = 15;

/**
 * How far a star's name sits from its centre, plane units: clear of the core,
 * the glint and the drift ring.
 */
export function labelOffset(radius: number): number {
  return round2(radius * 1.9 + 12);
}

/** Room kept clear round the edge of the plane, for halos and labels. */
const EDGE = 64;

export type StarTone = 'fine' | 'standard' | 'watch' | 'degraded' | 'unassayed';

export function starTone(label: FinenessLabel | null): StarTone {
  switch (label) {
    case 'Fine':
      return 'fine';
    case 'Standard':
      return 'standard';
    case 'Watch':
      return 'watch';
    case 'Degraded':
      return 'degraded';
    default:
      return 'unassayed';
  }
}

/**
 * How a tone is drawn. Brightness is Fineness (§8.8): Fine is gold-light with
 * a wide halo and a glint; Degraded is a dim, tarnished point with none.
 */
export interface StarStyle {
  core: string;
  coreOpacity: number;
  /** Halo radius as a multiple of the core. 0 = no halo. */
  halo: number;
  haloOpacity: number;
  /** The four-point glint, Fine only. */
  glint: boolean;
}

export const STAR_STYLES: Record<StarTone, StarStyle> = {
  fine: { core: 'var(--gold-light)', coreOpacity: 1, halo: 3.4, haloOpacity: 0.55, glint: true },
  standard: { core: 'var(--gold)', coreOpacity: 0.95, halo: 2.6, haloOpacity: 0.34, glint: false },
  watch: { core: 'var(--champagne)', coreOpacity: 0.7, halo: 2, haloOpacity: 0.16, glint: false },
  degraded: { core: 'var(--gold-deep)', coreOpacity: 0.55, halo: 0, haloOpacity: 0, glint: false },
  unassayed: { core: 'none', coreOpacity: 1, halo: 0, haloOpacity: 0, glint: false },
};

/** Core radius for `volume` lots against the largest EA's: √ scale, so area ∝ volume. */
export function starRadius(volume: number, maxVolume: number): number {
  if (!(maxVolume > 0) || !(volume > 0)) return STAR_MIN_RADIUS;
  const share = Math.sqrt(Math.min(volume / maxVolume, 1));
  return round2(STAR_MIN_RADIUS + (STAR_MAX_RADIUS - STAR_MIN_RADIUS) * share);
}

/** Link length for a correlation, clamped to the −1…1 it can be. */
export function linkDistance(correlation: number): number {
  const c = Math.max(-1, Math.min(1, correlation));
  return LINK_BASE + LINK_SPAN * (1 - c);
}

/** A thread's opacity is its correlation (§8.8). Negative or no correlation draws nothing. */
export function threadOpacity(correlation: number | null): number {
  if (correlation === null || correlation <= 0) return 0;
  return round2(Math.min(correlation, 1));
}

export interface LayoutNode {
  id: number;
  radius: number;
}

export interface LayoutLink {
  a: number;
  b: number;
  /** `null` = not enough overlap: no spring between them. */
  correlation: number | null;
}

export interface PlacedNode {
  id: number;
  x: number;
  y: number;
}

interface SimNode extends SimulationNodeDatum {
  id: number;
  radius: number;
}

/**
 * Lays the stars out: 300 ticks of a seeded force simulation, then frozen and
 * fitted into the plane. Nodes go in sorted by id, so input order cannot move
 * the sky.
 *
 * The fit only ever shrinks and centres — it never stretches — so the
 * distances stay proportional to `1 − correlation`.
 */
export function layoutConstellation(
  nodes: readonly LayoutNode[],
  links: readonly LayoutLink[],
  options: { width?: number; height?: number; ticks?: number; seed?: number } = {},
): PlacedNode[] {
  const width = options.width ?? SKY_WIDTH;
  const height = options.height ?? SKY_HEIGHT;
  const ticks = options.ticks ?? LAYOUT_TICKS;
  if (nodes.length === 0) return [];

  const simNodes: SimNode[] = [...nodes]
    .sort((x, y) => x.id - y.id)
    .map((node) => ({ id: node.id, radius: node.radius }));
  if (simNodes.length === 1) {
    return [{ id: simNodes[0]?.id ?? 0, x: width / 2, y: height / 2 }];
  }

  const known = new Set(simNodes.map((node) => node.id));
  const simLinks: (SimulationLinkDatum<SimNode> & { correlation: number })[] = links
    .filter(
      (link): link is LayoutLink & { correlation: number } =>
        link.correlation !== null && known.has(link.a) && known.has(link.b),
    )
    .map((link) => ({ source: link.a, target: link.b, correlation: link.correlation }))
    .sort(
      (x, y) =>
        Number(x.source) - Number(y.source) || Number(x.target) - Number(y.target),
    );

  const simulation = forceSimulation<SimNode>(simNodes)
    .randomSource(mulberry32(options.seed ?? LAYOUT_SEED))
    .force(
      'link',
      forceLink<SimNode, (typeof simLinks)[number]>(simLinks)
        .id((node) => node.id)
        .distance((link) => linkDistance(link.correlation))
        .strength(0.9),
    )
    .force('charge', forceManyBody<SimNode>().strength(-60))
    .force('collide', forceCollide<SimNode>().radius((node) => node.radius * 1.4 + 8))
    .force('center', forceCenter(0, 0))
    .stop();
  simulation.tick(ticks);

  // Fit: shrink (never stretch) the layout into the plane, centred.
  const xs = simNodes.map((node) => node.x ?? 0);
  const ys = simNodes.map((node) => node.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min(
    1,
    spanX > 0 ? (width - 2 * EDGE) / spanX : 1,
    spanY > 0 ? (height - 2 * EDGE) / spanY : 1,
  );
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return simNodes.map((node) => ({
    id: node.id,
    x: round2(width / 2 + ((node.x ?? 0) - midX) * scale),
    y: round2(height / 2 + ((node.y ?? 0) - midY) * scale),
  }));
}

/** Two parallel segments `gap` apart — the "same bet" double thread. */
export function doubleThread(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  gap: number,
): [[number, number, number, number], [number, number, number, number]] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * (gap / 2);
  const ny = (dx / length) * (gap / 2);
  return [
    [round2(x1 + nx), round2(y1 + ny), round2(x2 + nx), round2(y2 + ny)],
    [round2(x1 - nx), round2(y1 - ny), round2(x2 - nx), round2(y2 - ny)],
  ];
}

export interface FieldStar {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

/** The faint, static background field. Seeded: atmosphere, not data. */
export function starField(
  count: number,
  seed: number,
  width = SKY_WIDTH,
  height = SKY_HEIGHT,
): FieldStar[] {
  const next = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: round2(next() * width),
    y: round2(next() * height),
    r: round2(0.35 + next() * 0.75),
    opacity: round2(0.12 + next() * 0.33),
  }));
}

function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}
