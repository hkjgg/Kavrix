import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { CountUp } from '@/components/ui/CountUp';
import { ExplainButton } from '@/components/assay/ExplainButton';
import {
  DIAL_START_ANGLE,
  angleForKarat,
  arcPath,
  dialAltText,
  dialTicks,
  polar,
  tierSegments,
} from './dial';
import { ARRIVAL, beatStyle, tierArcBeat } from './instrument';

/**
 * The Assay Dial (CLAUDE.md §8.1) — the product's face, and the centre of the
 * Assay Instrument (Stage 3.5).
 *
 * Built the way a dial is made, back to front:
 *
 *  - **Bezel, three machined layers.** A dark outer edge; a brushed metal
 *    ring lit from the upper left (a directional gradient, with fine turned
 *    lines over it); and an inner chamfer sloping down to the face, which
 *    catches the light on the side the ring does not.
 *  - **Face with depth.** Darkening towards the rim, a guilloché rosette
 *    turned from overlapping circles the way a rose engine cuts one, and a
 *    faint specular sheen across the upper left.
 *  - **Scale.** Tier arcs in the gold family only (§9 keeps jade and oxblood
 *    for P&L), short crisp minor ticks, and an applied index — a small
 *    raised baton with its own shadow — under each serif numeral.
 *  - **A real hand.** A tapered, faceted blade, a short counterweight past the
 *    centre, and a soft drop shadow offset down-right onto the face.
 *  - **A raised centre medallion** holding the readout, with the polished
 *    centre cap and its pinhole at the pivot.
 *
 * The hand passes *behind* the medallion, so the Karat value is never crossed
 * by a moving part: only the blade (and, opposite it, the counterweight)
 * shows in the annulus between the medallion and the scale. The readout is
 * laid out around the cap the way a watch dial sets its name above the pinion
 * and its complication below it.
 *
 * Motion: every layer carries an `enter-*` class and a beat from `ARRIVAL`,
 * so the dial powers on in sequence when its scene is first seen, once. The
 * server renders every element in its final state — hand at the value,
 * counters at the value — so a reader without JavaScript, or who prefers
 * reduced motion, is shown the score, not a dial reading zero.
 *
 * SVG gradients and filters only; no images. The component computes no
 * metric (§16): `karat`, `tier` and `delta` all arrive from the engine.
 */

const CX = 220;
const CY = 220;

/* Radii, outside in. */
const R_EDGE = 217;
const R_BEZEL = 210.5;
const BEZEL_WIDTH = 9;
const R_CHAMFER = 204;
const CHAMFER_WIDTH = 4;
const R_FACE = 202;
const R_TIER_ARC = 188;
const R_TICK_OUTER = 180;
const R_TICK_MINOR_INNER = 175;
const R_TICK_INTEGER_INNER = 171.5;
const R_INDEX_OUTER = 181;
const R_INDEX_INNER = 165;
const R_NUMERAL = 148;
const R_MEDALLION = 112;
const R_CAP = 7;

/* The hand, pointing up at 0°. Lengths from the pivot. */
const HAND_TIP = 176;
const HAND_SHOULDER = 150;
const HAND_WIDEST = 118;
const HAND_ROOT = 40;
const COUNTERWEIGHT_AT = 124;
const COUNTERWEIGHT_R = 7.5;

/** One turn of the rose engine: overlapping circles on a common radius. */
interface Rosette {
  count: number;
  /** Distance from the dial centre to each circle's centre. */
  offset: number;
  radius: number;
  opacity: number;
}

const ROSETTES: readonly Rosette[] = [
  { count: 72, offset: 92, radius: 86, opacity: 0.1 },
  { count: 48, offset: 142, radius: 46, opacity: 0.085 },
  { count: 36, offset: 52, radius: 48, opacity: 0.07 },
];

function rosetteCircles(rosette: Rosette): Array<{ cx: number; cy: number; r: number }> {
  return Array.from({ length: rosette.count }, (_, index) => {
    const angle = (index / rosette.count) * 360;
    const centre = polar(CX, CY, rosette.offset, angle);
    return {
      cx: Math.round(centre.x * 100) / 100,
      cy: Math.round(centre.y * 100) / 100,
      r: rosette.radius,
    };
  });
}

/** Turned lines across the brushed bezel ring: light and shadow alternating. */
const BRUSH_LINES = Array.from({ length: 9 }, (_, index) => ({
  r: R_BEZEL - BEZEL_WIDTH / 2 + 0.6 + index * 0.98,
  light: index % 2 === 0,
}));

/** Left facet of the blade (lit), then the right (in shade). */
const HAND_LEFT = [
  `M ${CX} ${CY - HAND_TIP}`,
  `L ${CX - 4.2} ${CY - HAND_SHOULDER}`,
  `L ${CX - 7.2} ${CY - HAND_WIDEST}`,
  `L ${CX - 4.6} ${CY - HAND_ROOT}`,
  `L ${CX - 2.4} ${CY + COUNTERWEIGHT_AT}`,
  `L ${CX} ${CY + COUNTERWEIGHT_AT}`,
  'Z',
].join(' ');

const HAND_RIGHT = [
  `M ${CX} ${CY - HAND_TIP}`,
  `L ${CX + 4.2} ${CY - HAND_SHOULDER}`,
  `L ${CX + 7.2} ${CY - HAND_WIDEST}`,
  `L ${CX + 4.6} ${CY - HAND_ROOT}`,
  `L ${CX + 2.4} ${CY + COUNTERWEIGHT_AT}`,
  `L ${CX} ${CY + COUNTERWEIGHT_AT}`,
  'Z',
].join(' ');

const TICKS = dialTicks();
const TIER_ARCS = tierSegments();

/** A tick on a whole Karat that is not one of the engraved numerals. */
function isInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9;
}

export interface AssayDialProps {
  /** `null` while the window is still assaying (§6.1). */
  karat: number | null;
  tierLabel: string | null;
  /** Karat minus the same score a week ago. `null` when there is no comparison. */
  deltaKarat: number | null;
  /** Manual trades in the scored window. */
  tradeCount: number;
  minimumTrades: number;
  /** Small caption under the value, e.g. `Karat · 30 days`. */
  periodLabel: string;
  /** Key into the explain index for the score itself. */
  explainId: string;
  className?: string;
}

export function AssayDial({
  karat,
  tierLabel,
  deltaKarat,
  tradeCount,
  minimumTrades,
  periodLabel,
  explainId,
  className,
}: AssayDialProps) {
  const scored = karat !== null;
  const targetAngle = angleForKarat(karat ?? 0);
  const altText = dialAltText(karat, tierLabel, deltaKarat);

  const handStyle = {
    transform: `rotate(${targetAngle}deg)`,
    transformBox: 'view-box',
    transformOrigin: `${CX}px ${CY}px`,
    '--hand-from': `${DIAL_START_ANGLE}deg`,
    '--hand-to': `${targetAngle}deg`,
    ...beatStyle(ARRIVAL.hand),
  } as CSSProperties;

  const faceBeat = beatStyle(ARRIVAL.face) as CSSProperties;
  const scaleBeat = beatStyle(ARRIVAL.scale) as CSSProperties;

  return (
    <figure
      className={cn('relative mx-auto w-full', className)}
      // Its own compositor layer: a summary or a drawer passing over the
      // dial never makes it repaint its guilloché and gradients.
      style={{ containerType: 'inline-size', willChange: 'transform' }}
    >
      <svg viewBox="0 0 440 440" className="block w-full overflow-visible" aria-hidden="true">
        <defs>
          {/* Face: a touch of light at the centre, darkening to the rim. */}
          <radialGradient id="kavrix-dial-face" cx="50%" cy="46%" r="54%">
            <stop offset="0%" stopColor="var(--surface-2)" />
            <stop offset="38%" stopColor="var(--surface-1)" />
            <stop offset="78%" stopColor="var(--bg)" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>

          {/* The rim falling away into shadow — a gradient, not a blur, so the face is cheap to repaint. */}
          <radialGradient id="kavrix-dial-rim" cx="50%" cy="50%" r="50%">
            <stop offset="84%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.6" />
          </radialGradient>

          {/* The specular sheen: a soft oval of light, upper left. */}
          <radialGradient id="kavrix-dial-sheen" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--gold-light)" stopOpacity="0.09" />
            <stop offset="55%" stopColor="var(--gold-light)" stopOpacity="0.035" />
            <stop offset="100%" stopColor="var(--gold-light)" stopOpacity="0" />
          </radialGradient>

          {/* The shadow the raised medallion casts, as a gradient ring. */}
          <radialGradient id="kavrix-dial-medallion-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="88%" stopColor="#000000" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* Brushed ring, lit from the upper left. */}
          <linearGradient id="kavrix-dial-bezel" x1="10%" y1="4%" x2="90%" y2="96%">
            <stop offset="0%" stopColor="var(--gold-light)" />
            <stop offset="20%" stopColor="var(--gold)" />
            <stop offset="46%" stopColor="var(--gold-deep)" />
            <stop offset="74%" stopColor="var(--gold-deep)" stopOpacity="0.3" />
            <stop offset="90%" stopColor="var(--gold-deep)" />
            <stop offset="100%" stopColor="var(--gold)" />
          </linearGradient>

          {/* The chamfer slopes the other way, so it catches the light where the ring does not. */}
          <linearGradient id="kavrix-dial-chamfer" x1="90%" y1="96%" x2="10%" y2="4%">
            <stop offset="0%" stopColor="var(--gold-light)" />
            <stop offset="30%" stopColor="var(--gold)" />
            <stop offset="62%" stopColor="var(--gold-deep)" />
            <stop offset="100%" stopColor="var(--gold-deep)" stopOpacity="0.25" />
          </linearGradient>

          {/* One light across the whole dial, so every applied index is lit the same way. */}
          <linearGradient
            id="kavrix-dial-index"
            x1={CX - 200}
            y1={CY - 200}
            x2={CX + 200}
            y2={CY + 200}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="var(--gold-light)" />
            <stop offset="50%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--gold-deep)" />
          </linearGradient>

          {/* Faceted blade: the lit side, then the side in shade. Along the blade, base to tip. */}
          <linearGradient
            id="kavrix-dial-hand-lit"
            x1="0"
            y1={CY + COUNTERWEIGHT_AT}
            x2="0"
            y2={CY - HAND_TIP}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="var(--gold-deep)" />
            <stop offset="55%" stopColor="var(--gold)" />
            <stop offset="88%" stopColor="var(--gold-light)" />
            <stop offset="100%" stopColor="var(--gold-light)" />
          </linearGradient>
          <linearGradient
            id="kavrix-dial-hand-shade"
            x1="0"
            y1={CY + COUNTERWEIGHT_AT}
            x2="0"
            y2={CY - HAND_TIP}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="var(--gold-deep)" stopOpacity="0.6" />
            <stop offset="55%" stopColor="var(--gold-deep)" />
            <stop offset="100%" stopColor="var(--gold)" />
          </linearGradient>

          {/* Medallion: a touch lighter than the face, lit from the upper left. */}
          <radialGradient id="kavrix-dial-medallion" cx="40%" cy="34%" r="80%">
            <stop offset="0%" stopColor="var(--surface-2)" />
            <stop offset="62%" stopColor="var(--surface-1)" />
            <stop offset="100%" stopColor="var(--bg)" />
          </radialGradient>

          {/* Polished cap: a highlight up and to the left of the pivot. */}
          <radialGradient id="kavrix-dial-cap" cx="36%" cy="32%" r="72%">
            <stop offset="0%" stopColor="var(--gold-light)" />
            <stop offset="48%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--gold-deep)" />
          </radialGradient>

          <filter id="kavrix-dial-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id="kavrix-dial-glint" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>

          <clipPath id="kavrix-dial-clip">
            <circle cx={CX} cy={CY} r={R_FACE} />
          </clipPath>
        </defs>

        {/* ── Bezel ─────────────────────────────────────────────────────── */}
        <g className="enter-fade" style={faceBeat}>
          {/* 1. Dark outer edge, with a hairline where it meets the air. */}
          <circle cx={CX} cy={CY} r={R_EDGE} fill="none" stroke="#000000" strokeOpacity={0.75} strokeWidth={4} />
          <circle
            cx={CX}
            cy={CY}
            r={R_EDGE + 2}
            fill="none"
            stroke="var(--gold)"
            strokeOpacity={0.16}
            strokeWidth={0.6}
          />

          {/* 2. Brushed metal ring, lit from the upper left, with turned lines over it. */}
          <circle
            cx={CX}
            cy={CY}
            r={R_BEZEL}
            fill="none"
            stroke="url(#kavrix-dial-bezel)"
            strokeWidth={BEZEL_WIDTH}
          />
          <g fill="none" strokeWidth={0.35}>
            {BRUSH_LINES.map((line) => (
              <circle
                key={`brush-${line.r}`}
                cx={CX}
                cy={CY}
                r={line.r}
                stroke={line.light ? 'var(--gold-light)' : '#000000'}
                strokeOpacity={line.light ? 0.14 : 0.18}
              />
            ))}
          </g>

          {/* 3. Inner chamfer, catching the light the ring does not. */}
          <circle
            cx={CX}
            cy={CY}
            r={R_CHAMFER}
            fill="none"
            stroke="url(#kavrix-dial-chamfer)"
            strokeWidth={CHAMFER_WIDTH}
          />
          <circle
            cx={CX}
            cy={CY}
            r={R_CHAMFER - CHAMFER_WIDTH / 2}
            fill="none"
            stroke="#000000"
            strokeOpacity={0.6}
            strokeWidth={0.8}
          />
        </g>

        {/* One highlight across the bezel as the dial powers on. Invisible at rest. */}
        <path
          d={arcPath(CX, CY, R_BEZEL, -125, 125)}
          pathLength={1}
          fill="none"
          stroke="var(--gold-light)"
          strokeWidth={BEZEL_WIDTH - 1}
          strokeLinecap="round"
          strokeDasharray="0.14 2"
          opacity={0}
          filter="url(#kavrix-dial-glint)"
          className="enter-sweep"
          style={beatStyle(ARRIVAL.bezelSweep) as CSSProperties}
        />

        {/* ── Face ──────────────────────────────────────────────────────── */}
        <g className="enter-fade" style={faceBeat}>
          <circle cx={CX} cy={CY} r={R_FACE} fill="url(#kavrix-dial-face)" />

          <g clipPath="url(#kavrix-dial-clip)">
            {/* Guilloché rosette. */}
            {ROSETTES.map((rosette, rosetteIndex) => (
              <g
                key={`rosette-${rosetteIndex}`}
                fill="none"
                stroke="var(--gold)"
                strokeOpacity={rosette.opacity}
                strokeWidth={0.5}
              >
                {rosetteCircles(rosette).map((circle, index) => (
                  <circle
                    key={`rosette-${rosetteIndex}-${index}`}
                    cx={circle.cx}
                    cy={circle.cy}
                    r={circle.r}
                  />
                ))}
              </g>
            ))}

            {/* The rim falls away into shadow. */}
            <circle cx={CX} cy={CY} r={R_FACE} fill="url(#kavrix-dial-rim)" />

            {/* Specular sheen, a soft arc of light across the upper left. */}
            <ellipse
              cx={CX - 62}
              cy={CY - 88}
              rx={128}
              ry={58}
              transform={`rotate(-38 ${CX - 62} ${CY - 88})`}
              fill="url(#kavrix-dial-sheen)"
            />
          </g>
        </g>

        {/* ── Scale ─────────────────────────────────────────────────────── */}
        {/* Tier arcs, drawn clockwise as one stroke: Raw Ore darkest, 24K brightest (§6.2). */}
        <g fill="none" strokeWidth={5} strokeLinecap="butt">
          {TIER_ARCS.map((segment) => (
            <path
              key={segment.label}
              d={arcPath(CX, CY, R_TIER_ARC, segment.startAngle + 0.6, segment.endAngle - 0.6)}
              pathLength={1}
              stroke={segment.color}
              strokeOpacity={segment.opacity}
              className="enter-draw"
              style={
                {
                  ...beatStyle(tierArcBeat(segment.startAngle, segment.endAngle)),
                  '--ease': 'linear',
                } as CSSProperties
              }
            />
          ))}
        </g>

        <g className="enter-fade" style={scaleBeat}>
          {/* Minor ticks every 0.25K, a little longer on the whole Karats. */}
          <g strokeLinecap="butt">
            {TICKS.filter((tick) => !tick.major).map((tick) => {
              const whole = isInteger(tick.value);
              const from = polar(CX, CY, R_TICK_OUTER, tick.angle);
              const to = polar(CX, CY, whole ? R_TICK_INTEGER_INNER : R_TICK_MINOR_INNER, tick.angle);
              return (
                <line
                  key={`tick-${tick.value}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={whole ? 'var(--gold)' : 'var(--gold-light)'}
                  strokeOpacity={whole ? 0.55 : 0.3}
                  strokeWidth={whole ? 0.9 : 0.55}
                />
              );
            })}
          </g>

          {/* Applied indices under the numerals: a shadow, the baton, a lit edge. */}
          <g strokeLinecap="round">
            {TICKS.filter((tick) => tick.major).map((tick) => {
              const from = polar(CX, CY, R_INDEX_OUTER, tick.angle);
              const to = polar(CX, CY, R_INDEX_INNER, tick.angle);
              return (
                <g key={`index-${tick.value}`}>
                  <line
                    x1={from.x + 0.9}
                    y1={from.y + 1.3}
                    x2={to.x + 0.9}
                    y2={to.y + 1.3}
                    stroke="#000000"
                    strokeOpacity={0.7}
                    strokeWidth={3.6}
                  />
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="url(#kavrix-dial-index)"
                    strokeWidth={3.2}
                  />
                  <line
                    x1={from.x - 0.5}
                    y1={from.y - 0.5}
                    x2={to.x - 0.5}
                    y2={to.y - 0.5}
                    stroke="var(--gold-light)"
                    strokeOpacity={0.55}
                    strokeWidth={0.6}
                  />
                </g>
              );
            })}
          </g>

          {/* Engraved serif numerals: a cut shadow under the gold. */}
          <g
            className="font-serif"
            fontSize={23}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {TICKS.filter((tick) => tick.major).map((tick) => {
              const at = polar(CX, CY, R_NUMERAL, tick.angle);
              return (
                <g key={`numeral-${tick.value}`}>
                  <text x={at.x + 0.7} y={at.y + 0.9} fill="#000000" fillOpacity={0.75}>
                    {tick.value}
                  </text>
                  <text x={at.x} y={at.y} fill="var(--gold)" fillOpacity={0.88}>
                    {tick.value}
                  </text>
                </g>
              );
            })}
          </g>
        </g>

        {/* ── The hand ──────────────────────────────────────────────────── */}
        {scored ? (
          <>
            {/* Drop shadow: offset down and to the right in screen space, so the
                offset is applied outside the rotation. */}
            <g transform="translate(3 4.5)" opacity={0.6} filter="url(#kavrix-dial-soft)">
              <g className="enter-hand" style={handStyle}>
                <path d={HAND_LEFT} fill="#000000" />
                <path d={HAND_RIGHT} fill="#000000" />
                <circle cx={CX} cy={CY + COUNTERWEIGHT_AT} r={COUNTERWEIGHT_R} fill="#000000" />
              </g>
            </g>

            <g className="enter-hand" style={handStyle}>
              <path d={HAND_LEFT} fill="url(#kavrix-dial-hand-lit)" />
              <path d={HAND_RIGHT} fill="url(#kavrix-dial-hand-shade)" />
              {/* The ridge down the middle of the blade. */}
              <line
                x1={CX}
                y1={CY - HAND_TIP + 2}
                x2={CX}
                y2={CY - HAND_ROOT}
                stroke="var(--gold-light)"
                strokeOpacity={0.5}
                strokeWidth={0.5}
              />
              {/* Counterweight, past the centre. */}
              <circle cx={CX} cy={CY + COUNTERWEIGHT_AT} r={COUNTERWEIGHT_R} fill="url(#kavrix-dial-cap)" />
              <circle
                cx={CX}
                cy={CY + COUNTERWEIGHT_AT}
                r={COUNTERWEIGHT_R - 2.6}
                fill="none"
                stroke="#000000"
                strokeOpacity={0.4}
                strokeWidth={0.6}
              />
            </g>
          </>
        ) : null}

        {/* ── Centre medallion, raised ──────────────────────────────────── */}
        <g className="enter-fade" style={faceBeat}>
          {/* The shadow it casts on the face is what raises it. */}
          <circle cx={CX + 1.5} cy={CY + 3} r={R_MEDALLION + 9} fill="url(#kavrix-dial-medallion-shadow)" />
          <circle cx={CX} cy={CY} r={R_MEDALLION} fill="url(#kavrix-dial-medallion)" />
          <circle
            cx={CX}
            cy={CY}
            r={R_MEDALLION}
            fill="none"
            stroke="var(--gold)"
            strokeOpacity={0.5}
            strokeWidth={0.9}
          />
          {/* Its lit edge, upper left. */}
          <path
            d={arcPath(CX, CY, R_MEDALLION - 1, -95, -5)}
            fill="none"
            stroke="var(--gold-light)"
            strokeOpacity={0.3}
            strokeWidth={0.8}
          />
          <circle
            cx={CX}
            cy={CY}
            r={R_MEDALLION - 6}
            fill="none"
            stroke="var(--gold)"
            strokeOpacity={0.12}
            strokeWidth={0.5}
          />

          {/* Polished centre cap and its pinhole, at the pivot. */}
          {scored ? (
            <g>
              <circle cx={CX + 0.6} cy={CY + 1} r={R_CAP} fill="#000000" fillOpacity={0.6} />
              <circle cx={CX} cy={CY} r={R_CAP} fill="url(#kavrix-dial-cap)" />
              <circle
                cx={CX}
                cy={CY}
                r={R_CAP}
                fill="none"
                stroke="var(--gold-deep)"
                strokeWidth={0.6}
              />
              <circle cx={CX} cy={CY} r={1.5} fill="#000000" />
            </g>
          ) : null}
        </g>
      </svg>

      {/* The readout. Sized in container units so it scales with the face,
          and set around the cap: the value above the pivot, the rest below. */}
      <div className="pointer-events-none absolute inset-0">
        {scored ? (
          <>
            <div className="absolute inset-x-0 bottom-[52.6%] flex flex-col items-center">
              <ExplainButton
                explainId={explainId}
                label={altText}
                bare
                className="pointer-events-auto block rounded-md"
              >
                <span
                  className="metal-gold-text block font-serif leading-[0.9]"
                  style={{ fontSize: '16.5cqw' }}
                >
                  <CountUp
                    value={karat}
                    kind="karat"
                    durationMs={ARRIVAL.hand.duration}
                    delayMs={ARRIVAL.hand.delay}
                  />
                </span>
              </ExplainButton>
            </div>

            <div className="absolute inset-x-0 top-[53.4%] flex flex-col items-center text-center">
              {/* The tier is engraved once the hand has arrived at it. */}
              <span
                aria-hidden="true"
                className="enter-fade font-medium uppercase text-gold"
                style={
                  {
                    fontSize: 'max(10px, 2.8cqw)',
                    letterSpacing: '0.18em',
                    ...beatStyle({
                      delay: ARRIVAL.hand.delay + Math.round(ARRIVAL.hand.duration * 0.55),
                      duration: 500,
                    }),
                  } as CSSProperties
                }
              >
                {tierLabel}
              </span>

              <span
                aria-hidden="true"
                className={cn(
                  'mt-[1.4cqw] font-mono tabular-nums',
                  deltaKarat === null || deltaKarat === 0
                    ? 'text-text-3'
                    : deltaKarat > 0
                      ? 'text-jade'
                      : 'text-oxblood-text',
                )}
                style={{ fontSize: 'max(10px, 2.6cqw)' }}
              >
                {deltaKarat === null ? (
                  'no prior week'
                ) : (
                  <>
                    <CountUp
                      value={deltaKarat}
                      kind="karat"
                      signed
                      durationMs={ARRIVAL.hand.duration}
                      delayMs={ARRIVAL.hand.delay}
                    />
                    <span className="text-text-3"> vs last week</span>
                  </>
                )}
              </span>

              <span
                className="mt-[1.6cqw] font-medium uppercase text-text-3"
                style={{ fontSize: 'max(9px, 2.2cqw)', letterSpacing: '0.22em' }}
              >
                {periodLabel}
              </span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span
              className="font-medium uppercase text-text-3"
              style={{ fontSize: 'max(9px, 2.4cqw)', letterSpacing: '0.22em' }}
            >
              {periodLabel}
            </span>
            <span className="assaying mt-[2cqw] font-serif leading-none" style={{ fontSize: '11cqw' }}>
              Assaying…
            </span>
            <span className="mt-[3cqw] font-mono text-text-3" style={{ fontSize: 'max(10px, 2.8cqw)' }}>
              {tradeCount} of {minimumTrades} trades
            </span>
          </div>
        )}
      </div>

      <figcaption className="sr-only">{altText}</figcaption>
    </figure>
  );
}
