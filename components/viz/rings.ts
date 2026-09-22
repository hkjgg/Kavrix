/**
 * Pillar ring thresholds (CLAUDE.md §8.2).
 *
 * A ring is filled by `points / maxPoints` and coloured by how close the
 * pillar is to full marks: gold at 85% and above, bronze from 75%, oxblood
 * below that. The thresholds live here, away from the component, because they
 * are the one thing about the rings worth asserting.
 */

export type RingTone = 'gold' | 'bronze' | 'oxblood';

/** At or above this share of a pillar's points, the ring is gold. */
export const RING_GOLD_THRESHOLD = 0.85;
/** At or above this share, bronze. Below it, oxblood. */
export const RING_BRONZE_THRESHOLD = 0.75;

export const RING_TONE_COLOR: Record<RingTone, string> = {
  gold: 'var(--gold)',
  bronze: 'var(--bronze)',
  oxblood: 'var(--oxblood)',
};

/** How full the ring is, 0–1. A pillar with no maximum reads as full. */
export function ringRatio(points: number, maxPoints: number): number {
  if (!Number.isFinite(points) || !Number.isFinite(maxPoints) || maxPoints <= 0) {
    return 1;
  }
  return Math.min(Math.max(points / maxPoints, 0), 1);
}

/** Ring colour for a pillar's score. */
export function ringTone(points: number, maxPoints: number): RingTone {
  const ratio = ringRatio(points, maxPoints);
  if (ratio >= RING_GOLD_THRESHOLD) return 'gold';
  if (ratio >= RING_BRONZE_THRESHOLD) return 'bronze';
  return 'oxblood';
}

export function ringColor(points: number, maxPoints: number): string {
  return RING_TONE_COLOR[ringTone(points, maxPoints)];
}
