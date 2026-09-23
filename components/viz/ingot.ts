/**
 * The Vault's ingot (CLAUDE.md §8.7) — pure geometry and the tier → metal map.
 *
 * A cast bar seen slightly from above: a wide top face, the stamp struck into
 * it, and a narrower band of bevelled front face below, both softly rounded.
 * Two faces in two tones is what makes it read as metal. The **metal is the
 * Karat** — one shared gradient per tier, from rich gold at 24K to matte slate
 * for Raw Ore — and the P&L is a 2px assay strip under the bar, never on it.
 *
 * Every ingot has the same geometry, in its own 64-unit box, so the page can
 * share one set of gradients, one clip and one reflection mask between all of
 * them (`IngotDefs`).
 */

export const INGOT_VIEW = { width: 64, height: 42 } as const;

/** Where the bar stands on its shelf. */
export const INGOT_BASE_Y = 34;

type Point = readonly [number, number];

/** The top face: rear edge narrower than the front, the stamp's field. */
export const INGOT_TOP: readonly Point[] = [
  [12, 6],
  [52, 6],
  [56, 25],
  [8, 25],
];

/** The bevelled front face, flaring to the base. */
export const INGOT_FRONT: readonly Point[] = [
  [8, 25],
  [56, 25],
  [60, INGOT_BASE_Y],
  [4, INGOT_BASE_Y],
];

/** The whole silhouette, for the clip the sheen passes through. */
export const INGOT_OUTLINE: readonly Point[] = [
  [12, 6],
  [52, 6],
  [56, 25],
  [60, INGOT_BASE_Y],
  [4, INGOT_BASE_Y],
  [8, 25],
];

/** Where the Karat is struck: the middle of the top face. */
export const INGOT_STAMP = { x: 32, y: 19.4, size: 11.5 } as const;

/** The assay strip's lane under the shelf, and its longest length. */
export const INGOT_STRIP = { x: 4, y: 37, width: 56, height: 2 } as const;

/** The smallest strip drawn for a day that moved at all: a sliver still reads. */
export const MIN_STRIP_SHARE = 0.08;

const CORNER_RADIUS = 2.2;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A closed polygon with softly rounded corners: each corner is cut back along
 * both edges by `radius` (or less, on a short edge) and joined with a
 * quadratic curve through the corner itself.
 */
export function roundedPath(points: readonly Point[], radius = CORNER_RADIUS): string {
  const n = points.length;
  if (n < 3) return '';
  const parts: string[] = [];
  for (let index = 0; index < n; index += 1) {
    const prev = points[(index - 1 + n) % n] ?? points[0];
    const corner = points[index] ?? points[0];
    const next = points[(index + 1) % n] ?? points[0];
    if (prev === undefined || corner === undefined || next === undefined) return '';
    const toward = (target: Point): Point => {
      const dx = target[0] - corner[0];
      const dy = target[1] - corner[1];
      const length = Math.hypot(dx, dy);
      const cut = Math.min(radius, length / 2);
      return length === 0 ? corner : [corner[0] + (dx / length) * cut, corner[1] + (dy / length) * cut];
    };
    const a = toward(prev);
    const b = toward(next);
    parts.push(
      `${index === 0 ? 'M' : 'L'}${round2(a[0])} ${round2(a[1])} Q${round2(corner[0])} ${round2(corner[1])} ${round2(b[0])} ${round2(b[1])}`,
    );
  }
  return `${parts.join(' ')} Z`;
}

/** Mirror a shape in the shelf, for the reflection beneath it. */
export function reflect(points: readonly Point[], axisY = INGOT_BASE_Y): Point[] {
  return points.map(([x, y]) => [x, round2(2 * axisY - y)] as const);
}

/* -------------------------------------------------------------------------
 * Tiers → metal
 * ---------------------------------------------------------------------- */

/** One metal per Karat tier (§6.2), purest first. */
export const TIER_KEYS = ['pure', 'refined', 'solid', 'mixed', 'alloyed', 'raw'] as const;
export type TierKey = (typeof TIER_KEYS)[number];

/** The metal for an engine tier label (`22K · Refined` → `refined`). */
export function tierKey(label: string | null | undefined): TierKey | null {
  if (label === null || label === undefined) return null;
  if (label.startsWith('24K')) return 'pure';
  if (label.startsWith('22K')) return 'refined';
  if (label.startsWith('18K')) return 'solid';
  if (label.startsWith('14K')) return 'mixed';
  if (label.startsWith('10K')) return 'alloyed';
  return 'raw';
}

/* -------------------------------------------------------------------------
 * The assay strip
 * ---------------------------------------------------------------------- */

export interface AssayStrip {
  direction: 'profit' | 'loss' | 'none';
  /** 0–1 of the strip's lane. */
  share: number;
}

/**
 * The strip under a day: jade for a profit, oxblood for a loss, its length
 * linear in |P&L| against the month's largest day. A flat day has none.
 */
export function assayStrip(netMoney: number, monthMaxAbs: number): AssayStrip {
  if (!Number.isFinite(netMoney) || netMoney === 0 || !(monthMaxAbs > 0)) {
    return { direction: 'none', share: 0 };
  }
  const share = Math.min(Math.max(Math.abs(netMoney) / monthMaxAbs, MIN_STRIP_SHARE), 1);
  return { direction: netMoney > 0 ? 'profit' : 'loss', share: Math.round(share * 1000) / 1000 };
}

/** The strip's rectangle, centred under the bar. */
export function stripRect(strip: AssayStrip): { x: number; width: number } | null {
  if (strip.direction === 'none' || strip.share <= 0) return null;
  const width = round2(INGOT_STRIP.width * strip.share);
  return { x: round2(INGOT_STRIP.x + (INGOT_STRIP.width - width) / 2), width };
}
