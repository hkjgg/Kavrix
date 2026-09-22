/**
 * The Assay Instrument (CLAUDE.md §8.1–§8.2, Stage 3.5) — geometry and timing.
 *
 * The instrument is one composition: the Karat dial at the centre, the six
 * pillar sub-dials fixed around it and wired to its centre by gold arms, and a
 * thin, empty outer ring reserved for Stage 4's 24-hour trade clock.
 *
 * Everything here is pure and unit-tested the way `dial.ts` is. Positions are
 * in **percent of the square stage** (0–100 on both axes, centre at 50/50),
 * which is also the SVG user space of the stage's own layer, so the arms and
 * the HTML sub-dials line up without any measuring at runtime.
 */

import { polar } from './dial';

/** Stage centre, in stage percent. */
export const STAGE_CENTRE = 50;

/** The Karat dial's outer radius (bezel included), in stage percent. */
export const DIAL_RADIUS = 24;

/** Where the sub-dials sit: their centres lie on this circle. */
export const SUBDIAL_ORBIT = 35;

/** A sub-dial ring's radius, in stage percent. */
export const SUBDIAL_RADIUS = 5.5;

/**
 * The reserved outer ring: a thin band, deliberately empty, where Stage 4's
 * 24-hour trade clock (the Gold Clock, §8.3) will live.
 */
export const RESERVED_RING = { inner: 47, outer: 49.2 } as const;

/**
 * Clock positions of the six sub-dials, in the order the engine reports the
 * pillars (§6.1): 12, 2, 4, 6, 8, 10 o'clock. One pillar per hour mark, so
 * the six read clockwise round the face the way the engine lists them.
 */
export const SUBDIAL_CLOCK_HOURS: readonly number[] = [12, 2, 4, 6, 8, 10];

/** When a pillar is selected, it travels this share of the way to the centre. */
export const FOCUS_PULL = 0.16;
/** …and is drawn this much larger. */
export const FOCUS_SCALE = 1.3;
/** The five that were not selected shrink to this. */
export const FOCUS_RECEDE_SCALE = 0.88;

export type LabelSide = 'above' | 'below';
export type SummarySide = 'left' | 'right';

export interface SubDialPlacement {
  /** Clock hour, 1–12. */
  hour: number;
  /** Degrees clockwise from 12 o'clock. */
  angle: number;
  /** Centre, in stage percent. */
  x: number;
  y: number;
  /** The label is engraved on the side away from the dial. */
  labelSide: LabelSide;
  /** The hover summary opens on the side towards the stage's centre line. */
  summarySide: SummarySide;
  /** The gold arm, from the dial's bezel to the sub-dial's ring. */
  arm: { x1: number; y1: number; x2: number; y2: number };
  /** Translation, in stage percent, that pulls the sub-dial towards the centre on focus. */
  focusShift: { x: number; y: number };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Degrees clockwise from 12 o'clock for a clock hour. */
export function angleForHour(hour: number): number {
  return (((hour % 12) + 12) % 12) * 30;
}

/** Where the sub-dial at `index` (engine pillar order) sits on the stage. */
export function subDialPlacement(index: number): SubDialPlacement {
  const hour = SUBDIAL_CLOCK_HOURS[index % SUBDIAL_CLOCK_HOURS.length] ?? 12;
  const angle = angleForHour(hour);
  const centre = polar(STAGE_CENTRE, STAGE_CENTRE, SUBDIAL_ORBIT, angle);
  const armStart = polar(STAGE_CENTRE, STAGE_CENTRE, DIAL_RADIUS + 0.6, angle);
  const armEnd = polar(STAGE_CENTRE, STAGE_CENTRE, SUBDIAL_ORBIT - SUBDIAL_RADIUS - 0.6, angle);

  const x = round(centre.x);
  const y = round(centre.y);

  return {
    hour,
    angle,
    x,
    y,
    // The upper half engraves its label above the ring, the lower half below:
    // either way the text sits in the free space between the ring and the
    // reserved outer band, never against the dial.
    labelSide: y <= STAGE_CENTRE ? 'above' : 'below',
    // Left-hand sub-dials open their summary to the right, right-hand ones to
    // the left, so a summary never runs off the instrument. 12 and 6 open right.
    summarySide: x > STAGE_CENTRE + 0.001 ? 'left' : 'right',
    arm: {
      x1: round(armStart.x),
      y1: round(armStart.y),
      x2: round(armEnd.x),
      y2: round(armEnd.y),
    },
    focusShift: {
      x: round((STAGE_CENTRE - x) * FOCUS_PULL),
      y: round((STAGE_CENTRE - y) * FOCUS_PULL),
    },
  };
}

/* -------------------------------------------------------------------------
 * The arrival sequence — the instrument powering on, ~2.3 s, once.
 *
 * Face and guilloché → one highlight across the bezel → tier arcs drawn
 * clockwise → ticks and numerals → the six arms extend from the centre →
 * the sub-dial rings fill clockwise, 60 ms apart → the hand sweeps from 0 to
 * the value while the readout counts up with it.
 * ---------------------------------------------------------------------- */

export interface Beat {
  delay: number;
  duration: number;
}

export const ARRIVAL = {
  face: { delay: 0, duration: 450 },
  bezelSweep: { delay: 180, duration: 720 },
  tiers: { delay: 320, duration: 520 },
  scale: { delay: 620, duration: 380 },
  arms: { delay: 820, duration: 360 },
  rings: { delay: 980, duration: 520 },
  hand: { delay: 1100, duration: 1200 },
} as const satisfies Record<string, Beat>;

/** The stagger between one sub-dial ring and the next (clockwise). */
export const RING_STAGGER_MS = 60;

/** When the sequence has finished. */
export const ARRIVAL_TOTAL_MS = Math.max(
  ...Object.values(ARRIVAL).map((beat) => beat.delay + beat.duration),
  ARRIVAL.rings.delay + RING_STAGGER_MS * 5 + ARRIVAL.rings.duration,
);

/**
 * The beat for one tier arc, so the arcs draw as one continuous clockwise
 * stroke: each segment starts where the previous one ended and takes a share
 * of the time proportional to its length.
 */
export function tierArcBeat(startAngle: number, endAngle: number, sweep = 270): Beat {
  const from = startAngle + sweep / 2;
  const span = Math.max(endAngle - startAngle, 0);
  return {
    delay: Math.round(ARRIVAL.tiers.delay + (from / sweep) * ARRIVAL.tiers.duration),
    duration: Math.round((span / sweep) * ARRIVAL.tiers.duration),
  };
}

/** The beat for the ring at `index`, clockwise from 12 o'clock. */
export function ringBeat(index: number): Beat {
  return {
    delay: ARRIVAL.rings.delay + RING_STAGGER_MS * index,
    duration: ARRIVAL.rings.duration,
  };
}

/** Inline custom properties for an `enter-*` element. */
export function beatStyle(beat: Beat): Record<'--d' | '--t', string> {
  return { '--d': `${beat.delay}ms`, '--t': `${beat.duration}ms` };
}
