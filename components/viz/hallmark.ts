/**
 * The Hallmark (CLAUDE.md §8.6) — pure geometry.
 *
 * A 32 px radial glyph, one per trade, encoding exactly six dimensions, each
 * on its own ring so no two of them ever share a mark:
 *
 *   bezel        SL compliance   solid · broken (widened) · dotted (no stop)
 *   session ring session         three arcs — Asia at 10, London at 2, New York
 *                                at 6 o'clock — lit when the entry fell inside
 *   news pip     news proximity  at 12 o'clock: filled in the window, hollow at
 *                                15–60 min, absent when clear of the calendar
 *   risk arc     risk %          clockwise from 12; a tick marks the limit at
 *                                4 o'clock and the arc fills the ring at 3×
 *   hand         duration        a watch hand; one minute points at 12 and a
 *                                day at 11, on a log scale
 *   centre disc  R result        area grows with |R| up to 3R; jade for a win,
 *                                oxblood for a loss (§9: P&L colours only)
 *
 * Deterministic: the glyph is a function of the input and nothing else, and
 * every coordinate is rounded, so the same trade always draws the same bytes.
 * No filters, no gradients — twenty paths at most, cheap enough for a table.
 */

import type { SessionKey } from '@/lib/engine/enrich';
import { formatDuration, formatPct, formatR } from '@/lib/format';
import { SESSION_LABELS, NO_SESSION_LABEL } from '@/lib/ledger/labels';

/* -------------------------------------------------------------------------
 * Input
 * ---------------------------------------------------------------------- */

/** §6.8's news buckets: inside the window, 15–60 min away, or clear. */
export type HallmarkNews = 'in-window' | 'near' | 'clear';

/** Compliant = set within 60 s and never widened (§6.1). */
export type HallmarkStop = 'compliant' | 'widened' | 'none';

export interface HallmarkInput {
  rMultiple: number;
  riskPercent: number;
  /** The user's limit — the tick on the risk ring. */
  riskLimitPercent: number;
  durationSeconds: number;
  sessions: readonly SessionKey[];
  news: HallmarkNews;
  /** Minutes to the nearest release, for the description. `null` when none. */
  newsMinutes: number | null;
  stop: HallmarkStop;
}

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

export const HALLMARK_VIEWBOX = 32;
const C = HALLMARK_VIEWBOX / 2;

export const HALLMARK_RADII = {
  bezel: 15.1,
  session: 12,
  newsPip: 12,
  risk: 8.8,
  hand: 6.9,
  discMin: 1.6,
  discMax: 5.4,
} as const;

/** Where each session's arc is centred, in degrees clockwise from 12 o'clock. */
export const SESSION_ANGLES: Record<SessionKey, number> = {
  asia: 300,
  london: 60,
  newYork: 180,
};

/** Each session arc's sweep. The gaps between them hold the news pip. */
const SESSION_SPAN = 104;

/** The risk ring is full at this multiple of the limit. */
export const RISK_RING_MULTIPLE = 3;

/** |R| at which the disc stops growing. */
export const R_CAP = 3;

/** The hand's sweep: one minute at 0°, one day at this angle. */
const HAND_SWEEP = 330;
const DURATION_MIN_SECONDS = 60;
const DURATION_MAX_SECONDS = 86_400;

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

export interface Point {
  x: number;
  y: number;
}

/** A point `r` from the centre at `degrees` clockwise from 12 o'clock. */
export function polar(r: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return { x: round2(C + r * Math.sin(radians)), y: round2(C - r * Math.cos(radians)) };
}

/**
 * An SVG arc from `from` to `to` degrees, clockwise. A sweep of a full turn is
 * drawn as two halves — one arc command cannot close a circle.
 */
export function arcPath(r: number, from: number, to: number): string {
  const sweep = to - from;
  if (sweep <= 0) return '';
  if (sweep >= 359.99) {
    const a = polar(r, from);
    const b = polar(r, from + 180);
    return `M${a.x} ${a.y}A${r} ${r} 0 1 1 ${b.x} ${b.y}A${r} ${r} 0 1 1 ${a.x} ${a.y}`;
  }
  const start = polar(r, from);
  const end = polar(r, to);
  const large = sweep > 180 ? 1 : 0;
  return `M${start.x} ${start.y}A${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/* -------------------------------------------------------------------------
 * Geometry
 * ---------------------------------------------------------------------- */

export interface HallmarkGeometry {
  bezel: { stop: HallmarkStop; dash: string | null };
  sessions: Array<{ key: SessionKey; path: string; lit: boolean }>;
  news: { kind: HallmarkNews; at: Point; r: number };
  risk: {
    track: number;
    /** The part at or under the limit. */
    within: string;
    /** The part over it — drawn brighter. Empty when under the limit. */
    excess: string;
    limitTick: { from: Point; to: Point };
  };
  hand: { angle: number; tip: Point };
  disc: { r: number; tone: 'profit' | 'loss' | 'flat' };
}

/** Degrees the risk arc sweeps for a given risk %. */
export function riskSweep(riskPercent: number, limit: number): number {
  if (limit <= 0) return 0;
  return round2(360 * clamp01(riskPercent / (limit * RISK_RING_MULTIPLE)));
}

/** Degrees the hand points at for a holding time, log-scaled. */
export function durationAngle(seconds: number): number {
  if (!(seconds > DURATION_MIN_SECONDS)) return 0;
  const t =
    Math.log(seconds / DURATION_MIN_SECONDS) /
    Math.log(DURATION_MAX_SECONDS / DURATION_MIN_SECONDS);
  return round2(HAND_SWEEP * clamp01(t));
}

/** Radius of the centre disc. Area, not radius, would be truer — but at 32 px the eye reads radius. */
export function discRadius(rMultiple: number): number {
  const magnitude = clamp01(Math.abs(rMultiple) / R_CAP);
  return round2(
    HALLMARK_RADII.discMin + magnitude * (HALLMARK_RADII.discMax - HALLMARK_RADII.discMin),
  );
}

export function hallmarkGeometry(input: HallmarkInput): HallmarkGeometry {
  const limitAngle = 360 / RISK_RING_MULTIPLE;
  const sweep = riskSweep(input.riskPercent, input.riskLimitPercent);
  const angle = durationAngle(input.durationSeconds);
  const rounded = Number(input.rMultiple.toFixed(4));

  return {
    bezel: {
      stop: input.stop,
      dash: input.stop === 'compliant' ? null : input.stop === 'widened' ? '4.2 2.2' : '0.6 2',
    },
    sessions: (Object.keys(SESSION_ANGLES) as SessionKey[]).map((key) => {
      const centre = SESSION_ANGLES[key];
      return {
        key,
        path: arcPath(HALLMARK_RADII.session, centre - SESSION_SPAN / 2, centre + SESSION_SPAN / 2),
        lit: input.sessions.includes(key),
      };
    }),
    news: { kind: input.news, at: polar(HALLMARK_RADII.newsPip, 0), r: 1.55 },
    risk: {
      track: HALLMARK_RADII.risk,
      within: arcPath(HALLMARK_RADII.risk, 0, Math.min(sweep, limitAngle)),
      excess: sweep > limitAngle ? arcPath(HALLMARK_RADII.risk, limitAngle, sweep) : '',
      limitTick: {
        from: polar(HALLMARK_RADII.risk - 1.5, limitAngle),
        to: polar(HALLMARK_RADII.risk + 1.5, limitAngle),
      },
    },
    hand: { angle, tip: polar(HALLMARK_RADII.hand, angle) },
    disc: {
      r: discRadius(input.rMultiple),
      tone: rounded > 0 ? 'profit' : rounded < 0 ? 'loss' : 'flat',
    },
  };
}

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

const STOP_WORDS: Record<HallmarkStop, string> = {
  compliant: 'stop compliant',
  widened: 'stop widened',
  none: 'no stop',
};

function newsWords(input: HallmarkInput): string {
  const minutes =
    input.newsMinutes === null ? '' : ` (${Math.round(input.newsMinutes)} min from a release)`;
  if (input.news === 'in-window') return `in the news window${minutes}`;
  if (input.news === 'near') return `near news${minutes}`;
  return 'clear of news';
}

/**
 * The Hallmark in words — its `title` and accessible name. Each of the six
 * dimensions, in the order the legend reads them, from the outside in.
 */
export function describeHallmark(input: HallmarkInput): string {
  const result =
    input.rMultiple > 0 ? 'win' : input.rMultiple < 0 ? 'loss' : 'flat';
  const over = input.riskPercent > input.riskLimitPercent;
  const sessions =
    input.sessions.length === 0
      ? NO_SESSION_LABEL
      : input.sessions.map((key) => SESSION_LABELS[key]).join(' and ');
  return [
    `Hallmark: ${STOP_WORDS[input.stop]}`,
    sessions,
    newsWords(input),
    `risk ${formatPct(input.riskPercent, { digits: 2 })}${
      over ? `, over the ${formatPct(input.riskLimitPercent)} limit` : ''
    }`,
    `held ${formatDuration(input.durationSeconds)}`,
    `${result} ${formatR(input.rMultiple, { digits: 2 })}`,
  ].join(' · ');
}
