'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { CountUp } from '@/components/ui/CountUp';
import { ExplainButton } from '@/components/assay/ExplainButton';
import {
  DIAL_SWEEP_MS,
  DIAL_START_ANGLE,
  angleForKarat,
  arcPath,
  dialAltText,
  dialTicks,
  polar,
  tierSegments,
} from './dial';

/**
 * The Assay Dial (CLAUDE.md §8.1) — the product's face.
 *
 * A watch dial, drawn the way one is made: an obsidian face with radial
 * depth, a guilloché rosette turned from overlapping circles the way a rose
 * engine cuts one, fine concentric engraving over it, a machined gold bezel,
 * the 0–24K scale across 270°, tier arcs darkening from Raw Ore to Pure, and
 * a metallic hand that sweeps up from 0 on mount.
 *
 * The readout sits on a centre medallion with the hand passing behind it, so
 * the Karat value is never crossed by a moving part — a sector dial, not a
 * gauge with a label stuck on top.
 *
 * Everything here is geometry over one number. The component computes no
 * metric (§16): `karat`, `tier` and `delta` all arrive from the engine.
 */

const CX = 220;
const CY = 220;

/* Radii, outside in. */
const R_BEZEL = 206;
const R_BEZEL_WIDTH = 9;
const R_FACE = 202;
const R_TIER_ARC = 186;
const R_TICK_OUTER = 176;
const R_TICK_MINOR_INNER = 169;
const R_TICK_MAJOR_INNER = 162;
const R_NUMERAL = 146;
/** The hand lives in the annulus: the medallion covers everything inside it. */
const R_HAND_TIP = 170;
const R_HAND_BASE = 88;
const R_MEDALLION = 97;

/** One turn of the rose engine: overlapping circles on a common radius. */
interface Rosette {
  count: number;
  /** Distance from the dial centre to each circle's centre. */
  offset: number;
  radius: number;
  opacity: number;
}

const ROSETTES: readonly Rosette[] = [
  { count: 60, offset: 86, radius: 80, opacity: 0.075 },
  { count: 40, offset: 136, radius: 48, opacity: 0.065 },
  { count: 24, offset: 44, radius: 42, opacity: 0.055 },
];

function rosetteCircles(rosette: Rosette): Array<{ cx: number; cy: number; r: number }> {
  return Array.from({ length: rosette.count }, (_, index) => {
    const angle = (index / rosette.count) * 360;
    const centre = polar(CX, CY, rosette.offset, angle);
    return { cx: centre.x, cy: centre.y, r: rosette.radius };
  });
}

/** Fine concentric engraving under the rosette. */
const ENGRAVING_RADII = Array.from({ length: 28 }, (_, index) => 38 + index * 6);

/**
 * The blade, pointing up at 0°. It starts under the medallion and tapers to a
 * point at the scale, so what the reader sees is the tip travelling the arc.
 */
const HAND_PATH = [
  `M ${CX} ${CY - R_HAND_TIP}`,
  `L ${CX + 4.4} ${CY - 150}`,
  `L ${CX + 7.4} ${CY - 112}`,
  `L ${CX + 8.2} ${CY - R_HAND_BASE}`,
  `L ${CX - 8.2} ${CY - R_HAND_BASE}`,
  `L ${CX - 7.4} ${CY - 112}`,
  `L ${CX - 4.4} ${CY - 150}`,
  'Z',
].join(' ');

const TICKS = dialTicks();
const TIER_ARCS = tierSegments();

export interface AssayDialProps {
  /** `null` while the window is still assaying (§6.1). */
  karat: number | null;
  tierLabel: string | null;
  /** Karat minus the same score a week ago. `null` when there is no comparison. */
  deltaKarat: number | null;
  /** Manual trades in the scored window. */
  tradeCount: number;
  minimumTrades: number;
  /** Small caption over the value, e.g. `Karat · 30 days`. */
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
  const handRef = useRef<SVGGElement>(null);
  const scored = karat !== null;
  const targetAngle = angleForKarat(karat ?? 0);
  const altText = dialAltText(karat, tierLabel, deltaKarat);

  /**
   * The sweep.
   *
   * The server renders the hand **at its final angle**, so a reader without
   * JavaScript is told the truth rather than shown a dial reading zero. On
   * mount the hand is snapped back to 0K without a transition, then eased up
   * to the value over ~2.6 s — fast off the stop, settling into place, the way
   * a mechanical movement arrives.
   */
  useEffect(() => {
    const node = handRef.current;
    if (node === null || !scored) return;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    node.style.transition = 'none';
    node.style.transform = `rotate(${DIAL_START_ANGLE}deg)`;
    // Commit the reset before the transition is attached, or the browser
    // collapses both writes into one frame and nothing moves.
    void node.getBoundingClientRect();

    const frame = window.requestAnimationFrame(() => {
      node.style.transition = `transform ${DIAL_SWEEP_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      node.style.transform = `rotate(${targetAngle}deg)`;
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [targetAngle, scored]);

  return (
    <figure
      className={cn('relative mx-auto w-full max-w-[420px]', className)}
      style={{ containerType: 'inline-size' }}
    >
      <svg viewBox="0 0 440 440" className="block w-full" aria-hidden="true">
        <defs>
          <radialGradient id="kavrix-dial-face" cx="50%" cy="38%" r="72%">
            <stop offset="0%" stopColor="var(--surface-1)" />
            <stop offset="55%" stopColor="var(--bg)" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>

          <linearGradient id="kavrix-dial-bezel" x1="8%" y1="0%" x2="78%" y2="100%">
            <stop offset="0%" stopColor="var(--gold-light)" />
            <stop offset="22%" stopColor="var(--gold)" />
            <stop offset="48%" stopColor="var(--gold-deep)" />
            <stop offset="72%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--gold-deep)" />
          </linearGradient>

          {/* Along the blade, base to tip: shaded metal, not a flat fill. */}
          <linearGradient
            id="kavrix-dial-hand"
            x1="0"
            y1={CY - R_HAND_BASE}
            x2="0"
            y2={CY - R_HAND_TIP}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="var(--gold-deep)" />
            <stop offset="38%" stopColor="var(--gold)" />
            <stop offset="72%" stopColor="var(--gold-light)" />
            <stop offset="100%" stopColor="var(--gold)" />
          </linearGradient>

          <radialGradient id="kavrix-dial-medallion" cx="50%" cy="34%" r="78%">
            <stop offset="0%" stopColor="var(--surface-2)" />
            <stop offset="70%" stopColor="var(--surface-1)" />
            <stop offset="100%" stopColor="var(--bg)" />
          </radialGradient>

          {/* A soft halo under the blade, never over it — the metal keeps its edge. */}
          <filter id="kavrix-dial-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" />
          </filter>

          <clipPath id="kavrix-dial-clip">
            <circle cx={CX} cy={CY} r={R_FACE} />
          </clipPath>
        </defs>

        {/* Machined bezel: a wide metallic ring, a bright inner lip, a dark seat. */}
        <circle
          cx={CX}
          cy={CY}
          r={R_BEZEL}
          fill="none"
          stroke="url(#kavrix-dial-bezel)"
          strokeWidth={R_BEZEL_WIDTH}
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_BEZEL + R_BEZEL_WIDTH / 2}
          fill="none"
          stroke="var(--gold-light)"
          strokeOpacity={0.35}
          strokeWidth={0.75}
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_BEZEL - R_BEZEL_WIDTH / 2}
          fill="none"
          stroke="#000000"
          strokeOpacity={0.55}
          strokeWidth={1.5}
        />

        {/* The face. */}
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

          {/* Fine concentric engraving. */}
          <g fill="none" stroke="var(--gold)" strokeOpacity={0.035} strokeWidth={0.4}>
            {ENGRAVING_RADII.map((radius) => (
              <circle key={`engraving-${radius}`} cx={CX} cy={CY} r={radius} />
            ))}
          </g>
        </g>

        {/* Tier arcs: Raw Ore darkest, 24K brightest (§6.2). */}
        <g fill="none" strokeWidth={5} strokeLinecap="butt">
          {TIER_ARCS.map((segment) => (
            <path
              key={segment.label}
              d={arcPath(
                CX,
                CY,
                R_TIER_ARC,
                segment.startAngle + 0.6,
                segment.endAngle - 0.6,
              )}
              stroke={segment.color}
              strokeOpacity={segment.opacity}
            />
          ))}
        </g>

        {/* Scale: minor ticks every 0.25K, majors at the numerals. */}
        <g strokeLinecap="butt">
          {TICKS.map((tick) => {
            const inner = tick.major ? R_TICK_MAJOR_INNER : R_TICK_MINOR_INNER;
            const from = polar(CX, CY, R_TICK_OUTER, tick.angle);
            const to = polar(CX, CY, inner, tick.angle);
            return (
              <line
                key={`tick-${tick.value}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={tick.major ? 'var(--gold-light)' : 'var(--gold)'}
                strokeOpacity={tick.major ? 0.85 : 0.2}
                strokeWidth={tick.major ? 2 : 0.85}
              />
            );
          })}
        </g>

        {/* Engraved serif numerals. */}
        <g
          fill="var(--gold)"
          fillOpacity={0.82}
          fontFamily="var(--font-serif)"
          fontSize={23}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {TICKS.filter((tick) => tick.major).map((tick) => {
            const at = polar(CX, CY, R_NUMERAL, tick.angle);
            return (
              <text key={`numeral-${tick.value}`} x={at.x} y={at.y}>
                {tick.value}
              </text>
            );
          })}
        </g>

        {/* The hand. Drawn before the medallion, so it emerges from behind it. */}
        {scored ? (
          <g
            ref={handRef}
            style={{
              transform: `rotate(${targetAngle}deg)`,
              transformBox: 'view-box',
              transformOrigin: `${CX}px ${CY}px`,
            }}
          >
            <path
              d={HAND_PATH}
              fill="var(--gold)"
              fillOpacity={0.28}
              filter="url(#kavrix-dial-glow)"
            />
            <path d={HAND_PATH} fill="url(#kavrix-dial-hand)" />
            {/* A hairline of shadow down one side: the blade has thickness. */}
            <path
              d={`M ${CX + 0.5} ${CY - R_HAND_TIP + 6} L ${CX + 3.4} ${CY - 112} L ${CX + 3.8} ${CY - R_HAND_BASE} L ${CX + 0.5} ${CY - R_HAND_BASE} Z`}
              fill="#000000"
              fillOpacity={0.3}
            />
          </g>
        ) : null}

        {/* Centre medallion: the readout's seat, and the hand's pivot cover. */}
        <circle cx={CX} cy={CY} r={R_MEDALLION} fill="url(#kavrix-dial-medallion)" />
        <circle
          cx={CX}
          cy={CY}
          r={R_MEDALLION}
          fill="none"
          stroke="var(--gold)"
          strokeOpacity={0.4}
          strokeWidth={1}
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_MEDALLION - 5}
          fill="none"
          stroke="var(--gold)"
          strokeOpacity={0.12}
          strokeWidth={0.5}
        />
      </svg>

      {/* The readout. Sized in container units so it scales with the face. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-medium uppercase text-text-3"
          style={{ fontSize: '2.5cqw', letterSpacing: '0.22em' }}
        >
          {periodLabel}
        </span>

        {scored ? (
          <>
            <ExplainButton
              explainId={explainId}
              label={altText}
              bare
              className="mt-[1.5cqw] block"
            >
              <span
                className="metal-gold-text font-serif leading-none"
                style={{ fontSize: '17cqw' }}
              >
                <CountUp value={karat} kind="karat" durationMs={DIAL_SWEEP_MS} />
              </span>
            </ExplainButton>

            <span
              aria-hidden="true"
              className="mt-[2.5cqw] font-medium uppercase text-gold"
              style={{ fontSize: '2.9cqw', letterSpacing: '0.18em' }}
            >
              {tierLabel}
            </span>

            <span
              aria-hidden="true"
              className={cn(
                'mt-[1.8cqw] font-mono tabular-nums',
                deltaKarat === null || deltaKarat === 0
                  ? 'text-text-3'
                  : deltaKarat > 0
                    ? 'text-jade'
                    : 'text-oxblood-text',
              )}
              style={{ fontSize: '2.7cqw' }}
            >
              {deltaKarat === null ? (
                'no prior week'
              ) : (
                <>
                  <CountUp value={deltaKarat} kind="karat" signed durationMs={DIAL_SWEEP_MS} />
                  <span className="text-text-3"> vs last week</span>
                </>
              )}
            </span>
          </>
        ) : (
          <>
            <span
              className="assaying mt-[2cqw] font-serif leading-none"
              style={{ fontSize: '11cqw' }}
            >
              Assaying…
            </span>
            <span
              className="mt-[3cqw] font-mono text-text-3"
              style={{ fontSize: '2.9cqw' }}
            >
              {tradeCount} of {minimumTrades} trades
            </span>
          </>
        )}
      </div>

      <figcaption className="sr-only">{altText}</figcaption>
    </figure>
  );
}
