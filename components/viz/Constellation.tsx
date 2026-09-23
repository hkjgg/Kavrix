'use client';

import { cn } from '@/lib/cn';
import type { StarView, ThreadView } from '@/components/constellation/constellation';
import type { FieldStar, StarTone } from './constellation';
import { STAR_STYLES } from './constellation';

/**
 * The Constellation (CLAUDE.md §8.8): EAs as stars on a night sky.
 *
 * Positions arrive frozen — the force layout ran on the server, 300 seeded
 * ticks — so nothing here simulates, settles or jitters. Size is traded
 * volume; brightness is Fineness; a thin news-amber ring marks a drifting EA
 * without changing the star; fine gold threads join EAs whose daily P&L moves
 * together, their opacity the correlation, doubled and labelled for a
 * "same bet" pair.
 *
 * The drawing is decoration for sighted readers (`aria-hidden`). Every star is
 * also a real `<button>` laid over it, so Tab walks the stars, Enter or a tap
 * opens the EA, and each button's name carries every figure its tooltip shows.
 *
 * Motion: one fade-in of threads then stars, about a second, the first time
 * the scene is seen (the `enter-fade` scene system). Static under reduced
 * motion and without JavaScript.
 */

export interface ConstellationProps {
  width: number;
  height: number;
  stars: readonly StarView[];
  threads: readonly ThreadView[];
  field: readonly FieldStar[];
  selected: number | null;
  onOpen: (magic: number) => void;
  register: (magic: number, node: HTMLButtonElement | null) => void;
  alt: string;
}

const HALO_ID: Partial<Record<StarTone, string>> = {
  fine: 'sky-halo-fine',
  standard: 'sky-halo-standard',
  watch: 'sky-halo-watch',
};

function Star({ star, selected }: { star: StarView; selected: boolean }) {
  const style = STAR_STYLES[star.tone];
  const haloId = HALO_ID[star.tone];
  return (
    <g
      className="enter-fade"
      style={{ ['--d' as string]: `${star.delay}ms`, ['--t' as string]: '700ms' }}
    >
      {haloId !== undefined && style.halo > 0 ? (
        <circle cx={star.x} cy={star.y} r={star.r * style.halo} fill={`url(#${haloId})`} opacity={style.haloOpacity} />
      ) : null}
      {style.glint ? (
        <g stroke="var(--gold-light)" strokeLinecap="round" opacity="0.5">
          <line x1={star.x - star.r * 1.9} y1={star.y} x2={star.x + star.r * 1.9} y2={star.y} strokeWidth="0.6" />
          <line x1={star.x} y1={star.y - star.r * 1.9} x2={star.x} y2={star.y + star.r * 1.9} strokeWidth="0.6" />
        </g>
      ) : null}
      {star.tone === 'unassayed' ? (
        <circle cx={star.x} cy={star.y} r={star.r} fill="none" stroke="var(--text-3)" strokeWidth="1" strokeDasharray="2 2.5" />
      ) : (
        <>
          <circle
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill={star.tone === 'degraded' ? 'url(#sky-tarnish)' : style.core}
            opacity={style.coreOpacity}
          />
          {star.tone === 'fine' || star.tone === 'standard' ? (
            <circle cx={star.x - star.r * 0.28} cy={star.y - star.r * 0.3} r={star.r * 0.38} fill="#fff8e6" opacity="0.55" />
          ) : null}
        </>
      )}
      {star.drifting ? (
        <circle cx={star.x} cy={star.y} r={star.r + 6} fill="none" stroke="var(--news)" strokeWidth="1" opacity="0.9" />
      ) : null}
      {selected ? (
        <circle
          cx={star.x}
          cy={star.y}
          r={star.r + (star.drifting ? 11 : 7)}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="0.8"
          strokeDasharray="1.5 3"
        />
      ) : null}
    </g>
  );
}

function Tooltip({ star }: { star: StarView }) {
  // Open towards the middle of the sky so an edge star keeps it on screen.
  const align = star.left < 30 ? 'left-0' : star.left > 70 ? 'right-0' : 'left-1/2 -translate-x-1/2';
  const place = star.top < 28 ? 'top-full mt-7' : 'bottom-full mb-7';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none invisible absolute z-20 w-56 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-left opacity-0',
        'transition-[opacity,visibility] duration-150',
        'peer-hover:visible peer-hover:opacity-100 peer-hover:delay-[120ms] peer-focus-visible:visible peer-focus-visible:opacity-100 peer-focus-visible:delay-[120ms]',
        align,
        place,
      )}
    >
      <span className="block text-[10px] font-medium uppercase tracking-[2px] text-text-3">
        {star.name} · {star.magic}
      </span>
      <span className="mt-1.5 flex items-baseline gap-2">
        <span className="font-serif text-lg leading-none text-gold">{star.finenessText}</span>
        <span className="text-[10px] uppercase tracking-[1.5px] text-text-3">{star.labelText}</span>
      </span>
      <span className="mt-2 flex items-baseline justify-between font-mono text-[11px]">
        <span className="text-text-3">Net</span>
        <span className={star.netR.startsWith('−') ? 'text-oxblood-text' : 'text-jade'}>{star.netR}</span>
      </span>
      {star.drifting ? <span className="mt-1 block text-[11px] text-news">Drifting</span> : null}
    </span>
  );
}

export function Constellation({
  width,
  height,
  stars,
  threads,
  field,
  selected,
  onOpen,
  register,
  alt,
}: ConstellationProps) {
  return (
    <figure className="relative m-0">
      <div className="relative w-full" style={{ aspectRatio: `${width} / ${height}` }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <radialGradient id="sky-halo-fine">
              <stop offset="0%" stopColor="var(--gold-light)" stopOpacity="0.9" />
              <stop offset="35%" stopColor="var(--gold)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sky-halo-standard">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.75" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sky-halo-watch">
              <stop offset="0%" stopColor="var(--champagne)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--champagne)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sky-tarnish" cx="38%" cy="36%">
              <stop offset="0%" stopColor="var(--gold-deep)" />
              <stop offset="100%" stopColor="var(--slate)" />
            </radialGradient>
            <radialGradient id="sky-dusk" cx="50%" cy="45%" r="70%">
              <stop offset="0%" stopColor="#15141a" />
              <stop offset="100%" stopColor="var(--surface-1)" />
            </radialGradient>
          </defs>

          <rect width={width} height={height} fill="url(#sky-dusk)" />

          {/* Atmosphere only: seeded, static, no data. */}
          <g fill="var(--text-2)">
            {field.map((dot, index) => (
              <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} opacity={dot.opacity} />
            ))}
          </g>

          <g fill="none" stroke="var(--gold)" strokeLinecap="round">
            {threads.map((thread) => (
              <g
                key={`${thread.a}-${thread.b}`}
                className="enter-fade"
                style={{ ['--d' as string]: `${thread.delay}ms`, ['--t' as string]: '800ms' }}
                opacity={thread.opacity}
              >
                {thread.lines === null ? (
                  <line x1={thread.x1} y1={thread.y1} x2={thread.x2} y2={thread.y2} strokeWidth="0.75" />
                ) : (
                  thread.lines.map(([x1, y1, x2, y2], index) => (
                    <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="0.75" />
                  ))
                )}
              </g>
            ))}
          </g>

          {stars.map((star) => (
            <Star key={star.magic} star={star} selected={selected === star.magic} />
          ))}
        </svg>

        {threads
          .filter((thread) => thread.sameBet)
          .map((thread) => (
            <span
              key={`label-${thread.a}-${thread.b}`}
              aria-hidden="true"
              className="enter-fade pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-gold/30 bg-bg/80 px-2 py-0.5 font-mono text-[10px] tracking-[1px] text-gold"
              style={{
                left: `${thread.labelLeft}%`,
                top: `${thread.labelTop}%`,
                ['--d' as string]: '500ms',
                ['--t' as string]: '600ms',
              }}
            >
              Same bet · {thread.correlationText}
            </span>
          ))}

        {stars.map((star) => (
          <span
            key={`name-${star.magic}`}
            aria-hidden="true"
            className={cn(
              'enter-fade pointer-events-none absolute -translate-y-1/2 whitespace-nowrap text-[11px] font-medium tracking-[0.5px]',
              star.labelSide === 'left' ? '-translate-x-full' : '',
              selected === star.magic
                ? 'text-gold'
                : star.tone === 'degraded' || star.tone === 'unassayed'
                  ? 'text-text-3'
                  : 'text-text-2',
            )}
            style={{
              left: `${star.labelLeft}%`,
              top: `${star.top}%`,
              ['--d' as string]: `${star.delay + 150}ms`,
            }}
          >
            {star.name}
          </span>
        ))}

        <ul aria-label="EAs" className="m-0 list-none p-0">
          {stars.map((star) => (
            <li
              key={star.magic}
              className="absolute"
              style={{ left: `${star.left}%`, top: `${star.top}%` }}
            >
              <button
                type="button"
                ref={(node) => {
                  register(star.magic, node);
                }}
                onClick={() => {
                  onOpen(star.magic);
                }}
                aria-label={star.ariaLabel}
                aria-pressed={selected === star.magic}
                className="peer absolute size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full"
              />
              <Tooltip star={star} />

            </li>
          ))}
        </ul>
      </div>
      <figcaption className="sr-only">{alt}</figcaption>
    </figure>
  );
}
