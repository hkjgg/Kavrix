import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import type { AssayStrip, TierKey } from './ingot';
import {
  INGOT_FRONT,
  INGOT_OUTLINE,
  INGOT_STAMP,
  INGOT_STRIP,
  INGOT_TOP,
  INGOT_VIEW,
  TIER_KEYS,
  reflect,
  roundedPath,
  stripRect,
} from './ingot';

/**
 * The ingot (CLAUDE.md §8.7): the metal is the day's Karat, the assay strip
 * under it the day's P&L.
 *
 * `IngotDefs` is rendered once per page. Every ingot points at its gradients,
 * so a month of bars costs six gradients, not one per bar.
 */

type Stop = readonly [offset: number, color: string];

interface Metal {
  top: readonly Stop[];
  front: readonly Stop[];
  /** Struck letters: a shade darker than the face. */
  stamp: string;
  /** The light catching the rear edge. */
  rim: number;
  /** The specular highlight across the top face. */
  specular: number;
}

const mix = (a: string, share: number, b: string) => `color-mix(in srgb, var(--${a}) ${share}%, var(--${b}))`;

/** Pure is rich and bright, Raw Ore matte slate; purity rises and falls in the metal itself. */
export const TIER_METAL: Record<TierKey, Metal> = {
  pure: {
    top: [
      [0, mix('gold', 80, 'gold-light')],
      [0.55, 'var(--gold)'],
      [1, mix('gold', 70, 'gold-deep')],
    ],
    front: [
      [0, mix('gold', 88, 'gold-deep')],
      [1, 'var(--gold-deep)'],
    ],
    stamp: '#5a3f14',
    rim: 0.95,
    specular: 0.95,
  },
  refined: {
    top: [
      [0, mix('gold', 86, 'champagne')],
      [1, mix('gold', 64, 'gold-deep')],
    ],
    front: [
      [0, mix('gold', 70, 'gold-deep')],
      [1, mix('gold-deep', 80, 'bg')],
    ],
    stamp: '#553d18',
    rim: 0.6,
    specular: 0.4,
  },
  solid: {
    top: [
      [0, 'var(--champagne)'],
      [1, mix('champagne', 72, 'gold-deep')],
    ],
    front: [
      [0, mix('champagne', 55, 'gold-deep')],
      [1, mix('champagne', 28, 'gold-deep')],
    ],
    stamp: '#5b4c30',
    rim: 0.4,
    specular: 0.12,
  },
  mixed: {
    top: [
      [0, mix('champagne', 55, 'bronze')],
      [1, mix('gold', 40, 'bronze')],
    ],
    front: [
      [0, mix('bronze', 78, 'gold-deep')],
      [1, mix('bronze', 50, 'bg')],
    ],
    stamp: '#44301a',
    rim: 0.22,
    specular: 0.05,
  },
  alloyed: {
    top: [
      [0, mix('bronze', 90, 'gold')],
      [1, mix('bronze', 72, 'bg')],
    ],
    front: [
      [0, mix('bronze', 60, 'bg')],
      [1, mix('bronze', 40, 'bg')],
    ],
    stamp: '#2c1c0d',
    rim: 0.1,
    specular: 0,
  },
  raw: {
    top: [
      [0, mix('slate', 82, 'text-2')],
      [1, mix('slate', 92, 'text-3')],
    ],
    front: [
      [0, mix('slate', 70, 'bg')],
      [1, mix('slate', 52, 'bg')],
    ],
    stamp: '#1d1c21',
    rim: 0.05,
    specular: 0,
  },
};

const TOP_PATH = roundedPath(INGOT_TOP);
const FRONT_PATH = roundedPath(INGOT_FRONT);
const OUTLINE_PATH = roundedPath(INGOT_OUTLINE);
const REFLECT_PATH = roundedPath(reflect(INGOT_FRONT));
const REFLECT_TOP_PATH = roundedPath(reflect(INGOT_TOP));
const RIM_PATH = `M${(INGOT_TOP[0]?.[0] ?? 12) + 2} ${(INGOT_TOP[0]?.[1] ?? 6) + 0.6} H${(INGOT_TOP[1]?.[0] ?? 52) - 2}`;

function stops(list: readonly Stop[]) {
  return list.map(([offset, color]) => (
    <stop key={offset} offset={offset} style={{ stopColor: color } as CSSProperties} />
  ));
}

/** The shared paint: six metals, the sheen, the clip, the reflection's fade, the shelf. */
export function IngotDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="pointer-events-none absolute size-0 overflow-hidden">
      <defs>
        {TIER_KEYS.map((key) => (
          <g key={key}>
            <linearGradient id={`ingot-top-${key}`} x1="0" y1="0" x2="1" y2="1">
              {stops(TIER_METAL[key].top)}
            </linearGradient>
            <linearGradient id={`ingot-front-${key}`} x1="0" y1="0" x2="0" y2="1">
              {stops(TIER_METAL[key].front)}
            </linearGradient>
          </g>
        ))}
        {/* A diagonal band of gold-light across the top face, lit from the upper left. */}
        <linearGradient id="ingot-specular" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="var(--gold-light)" stopOpacity="0" />
          <stop offset="0.22" stopColor="var(--gold-light)" stopOpacity="0.95" />
          <stop offset="0.3" stopColor="var(--gold-light)" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="var(--gold-light)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ingot-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="ingot-clip" clipPathUnits="userSpaceOnUse">
          <path d={OUTLINE_PATH} />
        </clipPath>
        {/* The reflection fades out below the shelf, never above 8%. */}
        <linearGradient id="ingot-reflect-fade" gradientUnits="userSpaceOnUse" x1="0" y1="34" x2="0" y2="42">
          <stop offset="0" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="ingot-reflect" maskUnits="userSpaceOnUse" x="0" y="34" width="64" height="8">
          <rect x="0" y="34" width="64" height="8" fill="url(#ingot-reflect-fade)" />
        </mask>
        {/* The shelf: a gold-deep hairline, fading at the ends of each week. */}
        <linearGradient id="shelf-start" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--gold-deep)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--gold-deep)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="shelf-end" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--gold-deep)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--gold-deep)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export type ShelfEdge = 'start' | 'end' | 'middle';

/** The hairline under a slot. Adjacent slots meet, so a week reads as one shelf. */
export function ShelfLine({ edge }: { edge: ShelfEdge }) {
  const fill =
    edge === 'start' ? 'url(#shelf-start)' : edge === 'end' ? 'url(#shelf-end)' : 'var(--gold-deep)';
  return (
    <rect
      x={0}
      y={34.1}
      width={INGOT_VIEW.width}
      height={0.7}
      fill={fill}
      fillOpacity={edge === 'middle' ? 0.55 : 1}
    />
  );
}

export interface IngotProps {
  /** `null` draws an unassayed bar: a day with trades but no manual ones. */
  tier: TierKey | null;
  /** The day Karat, as stamped. */
  karat: number | null;
  strip: AssayStrip;
  /** The month's best or worst day carries a hallmark in the corner. */
  mark?: 'best' | 'worst' | null;
  selected?: boolean;
  shelf?: ShelfEdge;
  className?: string;
}

/** The hallmark in the top face's corner: a lozenge with a chevron up (best) or down (worst). */
function Mark({ kind, color }: { kind: 'best' | 'worst'; color: string }) {
  const cx = 47.2;
  const cy = 10.6;
  const chevron = kind === 'best' ? `M${cx - 1.5} ${cy + 0.8} L${cx} ${cy - 0.8} L${cx + 1.5} ${cy + 0.8}` : `M${cx - 1.5} ${cy - 0.8} L${cx} ${cy + 0.8} L${cx + 1.5} ${cy - 0.8}`;
  return (
    <g data-mark={kind} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={cx - 3} y={cy - 3} width={6} height={6} rx={1.2} stroke="#fff" strokeOpacity={0.3} strokeWidth={0.5} transform={`translate(0 -0.5)`} />
      <rect x={cx - 3} y={cy - 3} width={6} height={6} rx={1.2} stroke={color} strokeWidth={0.7} />
      <path d={chevron} stroke={color} strokeWidth={0.8} />
    </g>
  );
}

export function Ingot({ tier, karat, strip, mark = null, selected = false, shelf = 'middle', className }: IngotProps) {
  const metal = tier === null ? null : TIER_METAL[tier];
  const bar = stripRect(strip);
  const stamp = karat === null ? null : karat.toFixed(1);

  return (
    <svg
      viewBox={`0 0 ${INGOT_VIEW.width} ${INGOT_VIEW.height}`}
      className={cn('block h-auto w-full overflow-visible', className)}
      aria-hidden="true"
      focusable="false"
      data-tier={tier ?? 'none'}
    >
      <ShelfLine edge={shelf} />

      {/* The reflection in the shelf: the same metal, flipped, fading out. */}
      {metal !== null ? (
        <g mask="url(#ingot-reflect)">
          <path d={REFLECT_TOP_PATH} fill={`url(#ingot-top-${tier})`} />
          <path d={REFLECT_PATH} fill={`url(#ingot-front-${tier})`} />
        </g>
      ) : null}

      {bar !== null ? (
        <rect
          data-strip={strip.direction}
          x={bar.x}
          y={INGOT_STRIP.y}
          width={bar.width}
          height={INGOT_STRIP.height}
          rx={0.6}
          fill={strip.direction === 'profit' ? 'var(--jade)' : 'var(--oxblood)'}
        />
      ) : null}

      <g className="ingot-body">
        {metal === null ? (
          <>
            <path d={TOP_PATH} fill="none" stroke="var(--slate)" strokeOpacity={0.6} strokeWidth={0.8} />
            <path d={FRONT_PATH} fill="none" stroke="var(--slate)" strokeOpacity={0.45} strokeWidth={0.8} />
          </>
        ) : (
          <>
            <path d={FRONT_PATH} fill={`url(#ingot-front-${tier})`} />
            <path d={TOP_PATH} fill={`url(#ingot-top-${tier})`} />
            {metal.specular > 0 ? (
              <path d={TOP_PATH} fill="url(#ingot-specular)" opacity={metal.specular} />
            ) : null}
            {/* The edge where the two faces meet catches a little light. */}
            <path d="M9.5 25.15 H54.5" stroke="#fff" strokeOpacity={0.1 + metal.rim * 0.2} strokeWidth={0.5} />
            <path d={RIM_PATH} stroke="var(--gold-light)" strokeOpacity={metal.rim} strokeWidth={0.6} strokeLinecap="round" />
            {stamp !== null ? (
              <g className="font-serif" textAnchor="middle" fontSize={INGOT_STAMP.size}>
                {/* Struck into the face: lighter a unit above, darker a unit below. */}
                <text x={INGOT_STAMP.x} y={INGOT_STAMP.y - 0.8} fill="#fff" fillOpacity={0.32}>
                  {stamp}
                </text>
                <text x={INGOT_STAMP.x} y={INGOT_STAMP.y + 0.8} fill="#000" fillOpacity={0.45}>
                  {stamp}
                </text>
                <text x={INGOT_STAMP.x} y={INGOT_STAMP.y} fill={metal.stamp}>
                  {stamp}
                </text>
              </g>
            ) : null}
            {mark !== null ? <Mark kind={mark} color={metal.stamp} /> : null}
            {/* One pass of light on hover or focus. The clip holds still; the band moves. */}
            <g clipPath="url(#ingot-clip)">
              <rect className="ingot-sheen" x={-24} y={0} width={24} height={36} fill="url(#ingot-sheen)" />
            </g>
          </>
        )}
        {selected ? (
          <path d={OUTLINE_PATH} fill="none" stroke="var(--gold)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ) : null}
      </g>
    </svg>
  );
}

/** A day with no trades: a faint slot recessed into the shelf. */
export function IngotSlot({ shelf = 'middle' }: { shelf?: ShelfEdge }) {
  return (
    <svg
      viewBox={`0 0 ${INGOT_VIEW.width} ${INGOT_VIEW.height}`}
      className="block h-auto w-full overflow-visible"
      aria-hidden="true"
      focusable="false"
      data-slot="empty"
    >
      <ShelfLine edge={shelf} />
      <rect x={9} y={31.6} width={46} height={2.6} rx={1.3} fill="#000" fillOpacity={0.45} />
      <path d="M10.5 34.3 H53.5" stroke="var(--gold-deep)" strokeOpacity={0.35} strokeWidth={0.5} />
    </svg>
  );
}

/** A slot outside the history: the shelf alone, so the week still reads as one. */
export function ShelfOnly({ shelf = 'middle' }: { shelf?: ShelfEdge }) {
  return (
    <svg
      viewBox={`0 0 ${INGOT_VIEW.width} ${INGOT_VIEW.height}`}
      className="block h-auto w-full"
      aria-hidden="true"
      focusable="false"
    >
      <ShelfLine edge={shelf} />
    </svg>
  );
}
