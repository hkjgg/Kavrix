/**
 * Assay Dial geometry (CLAUDE.md §8.1).
 *
 * Pure trigonometry, kept out of the component so the watch face can be
 * unit-tested the way an engine formula is. Nothing here reads engine data or
 * computes a metric — it turns a Karat value into an angle and a tier into an
 * arc.
 *
 * Angles are **degrees clockwise from 12 o'clock**, which is how a watch dial
 * is described and how SVG `rotate()` reads once the hand points up at 0°.
 * The scale is a 270° arc with its gap at the bottom: 0K sits at −135°
 * (7 o'clock), 24K at +135° (5 o'clock).
 */

import { TIERS } from '@/lib/engine/karat';

/** Lowest value on the scale. */
export const DIAL_MIN = 0;
/** Highest value on the scale — 24K is pure gold (§6.1). */
export const DIAL_MAX = 24;
/** The scale spans 270°, leaving a 90° gap at the bottom of the face. */
export const DIAL_SWEEP = 270;
/** Where 0K sits. */
export const DIAL_START_ANGLE = -DIAL_SWEEP / 2;
/** Where 24K sits. */
export const DIAL_END_ANGLE = DIAL_SWEEP / 2;

/** Serif numerals are engraved at these values (§8.1). */
export const DIAL_MAJOR_VALUES: readonly number[] = [0, 10, 14, 18, 22, 24];

/** Minor ticks every 0.25K (§8.1). */
export const DIAL_MINOR_STEP = 0.25;

/** Duration of the hand sweep on mount, in ms (§8.1: ~2.6 s). */
export const DIAL_SWEEP_MS = 2600;

/**
 * Angle of a Karat value on the face.
 *
 * Values outside the scale are clamped: the hand cannot leave the dial, the
 * way a real movement cannot drive its hand past the stop pin.
 */
export function angleForKarat(value: number): number {
  if (!Number.isFinite(value)) return DIAL_START_ANGLE;
  const clamped = Math.min(Math.max(value, DIAL_MIN), DIAL_MAX);
  return DIAL_START_ANGLE + ((clamped - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * DIAL_SWEEP;
}

export interface Point {
  x: number;
  y: number;
}

/** A point on the face, `angle` degrees clockwise from 12 o'clock. */
export function polar(cx: number, cy: number, radius: number, angle: number): Point {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

/**
 * An SVG arc along the face, swept clockwise from `from` to `to`.
 *
 * A full 360° arc cannot be drawn with one `A` command (start and end would
 * coincide), but the dial never needs one — its widest arc is 270°.
 */
export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
): string {
  const start = polar(cx, cy, radius, from);
  const end = polar(cx, cy, radius, to);
  const largeArc = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to >= from ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

export interface TierSegment {
  label: string;
  /** Lowest Karat in the segment. */
  min: number;
  /** Highest Karat in the segment — the next tier's floor, or 24. */
  max: number;
  startAngle: number;
  endAngle: number;
  /** A CSS colour, always from the gold family. */
  color: string;
  /** Stroke opacity: Raw Ore is the darkest, Pure the brightest (§8.1). */
  opacity: number;
}

/**
 * Tier arcs, lowest first.
 *
 * Choice: every segment is painted in the **gold family only** — gold-deep at
 * a low opacity for Raw Ore, brightening through gold to gold-light at 24K.
 * §9 reserves jade and oxblood for P&L, and a tier is not a P&L; reading the
 * arc as one continuous metal darkening towards the bottom of the scale is
 * also what a bullion bar actually looks like.
 */
export function tierSegments(): TierSegment[] {
  const ascending = [...TIERS].sort((a, b) => a.min - b.min);
  const shades: Array<{ color: string; opacity: number }> = [
    { color: 'var(--gold-deep)', opacity: 0.3 },
    { color: 'var(--gold-deep)', opacity: 0.55 },
    { color: 'var(--gold-deep)', opacity: 0.85 },
    { color: 'var(--gold)', opacity: 0.7 },
    { color: 'var(--gold)', opacity: 1 },
    { color: 'var(--gold-light)', opacity: 1 },
  ];

  return ascending.map((tier, index) => {
    const next = ascending[index + 1];
    const max = next === undefined ? DIAL_MAX : next.min;
    const shade = shades[index] ?? { color: 'var(--gold)', opacity: 1 };
    return {
      label: tier.label,
      min: tier.min,
      max,
      startAngle: angleForKarat(tier.min),
      endAngle: angleForKarat(max),
      color: shade.color,
      opacity: shade.opacity,
    };
  });
}

export interface DialTick {
  value: number;
  angle: number;
  major: boolean;
}

/** Every tick on the face: minor every 0.25K, major at the engraved numerals. */
export function dialTicks(step: number = DIAL_MINOR_STEP): DialTick[] {
  const ticks: DialTick[] = [];
  const count = Math.round((DIAL_MAX - DIAL_MIN) / step);
  for (let index = 0; index <= count; index += 1) {
    // Rebuilt from the index rather than accumulated, so 0.25 × 40 is exactly
    // 10 and the major ticks land on their numerals.
    const value = Math.round((DIAL_MIN + index * step) * 1000) / 1000;
    ticks.push({
      value,
      angle: angleForKarat(value),
      major: DIAL_MAJOR_VALUES.includes(value),
    });
  }
  return ticks;
}

/**
 * The dial's text alternative (CLAUDE.md §16).
 *
 * `Karat 23.1K, 22K Refined, up 0.3K vs last week` — one sentence, the same
 * three facts the face shows, and nothing a sighted reader does not get.
 */
export function dialAltText(
  karat: number | null,
  tierLabel: string | null,
  deltaKarat: number | null,
): string {
  if (karat === null) {
    return 'Assaying. Not enough trades in the window to score yet.';
  }

  const parts = [`Karat ${karat.toFixed(1)}K`];
  if (tierLabel !== null) parts.push(tierLabel.replace(' · ', ' '));

  if (deltaKarat !== null) {
    const move = Math.abs(deltaKarat).toFixed(1);
    if (Number(move) === 0) parts.push('unchanged vs last week');
    else parts.push(`${deltaKarat > 0 ? 'up' : 'down'} ${move}K vs last week`);
  }

  return parts.join(', ');
}
