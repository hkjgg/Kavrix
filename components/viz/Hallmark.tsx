import { cn } from '@/lib/cn';
import type { HallmarkInput } from './hallmark';
import { HALLMARK_RADII, HALLMARK_VIEWBOX, describeHallmark, hallmarkGeometry } from './hallmark';

/**
 * The Hallmark (CLAUDE.md §8.6): a trade's six dimensions as one radial glyph.
 *
 * Pure SVG — strokes and fills, no filters, no gradients — so a page of the
 * Ledger draws fifty of them without a repaint anyone can feel. The geometry
 * lives in `hallmark.ts`; this file only paints it.
 *
 * Server-safe: no hooks, no browser APIs.
 */

const SESSION_STROKE = {
  asia: 'var(--slate)',
  london: 'var(--gold)',
  newYork: 'var(--bronze)',
} as const;

const DISC_FILL = {
  profit: 'var(--jade)',
  loss: 'var(--oxblood)',
  flat: 'var(--text-3)',
} as const;

export interface HallmarkProps {
  input: HallmarkInput;
  /** Rendered size in px. The glyph is designed at 32. */
  size?: number;
  className?: string;
  /**
   * Hide it from assistive technology when the surrounding row already reads
   * the same facts aloud. Default `false`: the glyph carries its own name.
   */
  decorative?: boolean;
}

export function Hallmark({ input, size = 32, className, decorative = false }: HallmarkProps) {
  const g = hallmarkGeometry(input);
  const description = describeHallmark(input);
  const c = HALLMARK_VIEWBOX / 2;

  return (
    <svg
      viewBox={`0 0 ${HALLMARK_VIEWBOX} ${HALLMARK_VIEWBOX}`}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      fill="none"
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': description })}
    >
      {decorative ? null : <title>{description}</title>}

      {/* Bezel — SL compliance. */}
      <circle
        cx={c}
        cy={c}
        r={HALLMARK_RADII.bezel}
        stroke={g.bezel.stop === 'none' ? 'var(--text-3)' : 'var(--gold)'}
        strokeOpacity={g.bezel.stop === 'compliant' ? 0.7 : 0.85}
        strokeWidth={g.bezel.stop === 'none' ? 1.1 : 0.9}
        strokeDasharray={g.bezel.dash ?? undefined}
        strokeLinecap="round"
      />

      {/* Session ring — lit where the entry fell. */}
      {g.sessions.map((arc) => (
        <path
          key={arc.key}
          d={arc.path}
          stroke={arc.lit ? SESSION_STROKE[arc.key] : 'var(--text-3)'}
          strokeOpacity={arc.lit ? 1 : 0.16}
          strokeWidth={2}
          strokeLinecap="butt"
        />
      ))}

      {/* News pip — 12 o'clock, in the gap between Asia and London. */}
      {g.news.kind === 'in-window' ? (
        <circle cx={g.news.at.x} cy={g.news.at.y} r={g.news.r} fill="var(--news)" />
      ) : g.news.kind === 'near' ? (
        <circle
          cx={g.news.at.x}
          cy={g.news.at.y}
          r={g.news.r - 0.35}
          stroke="var(--news)"
          strokeWidth={0.8}
        />
      ) : null}

      {/* Risk arc — the track, the part within the limit, the excess, the limit tick. */}
      <circle cx={c} cy={c} r={g.risk.track} stroke="var(--text-3)" strokeOpacity={0.14} strokeWidth={1.4} />
      {g.risk.within !== '' ? (
        <path d={g.risk.within} stroke="var(--gold-deep)" strokeWidth={1.4} strokeLinecap="butt" />
      ) : null}
      {g.risk.excess !== '' ? (
        <path d={g.risk.excess} stroke="var(--gold-light)" strokeWidth={1.4} strokeLinecap="butt" />
      ) : null}
      <line
        x1={g.risk.limitTick.from.x}
        y1={g.risk.limitTick.from.y}
        x2={g.risk.limitTick.to.x}
        y2={g.risk.limitTick.to.y}
        stroke="var(--text-2)"
        strokeOpacity={0.6}
        strokeWidth={0.6}
      />

      {/* Hand — holding time. Drawn under the disc, like a hand under its cap. */}
      <line
        x1={c}
        y1={c}
        x2={g.hand.tip.x}
        y2={g.hand.tip.y}
        stroke="var(--text)"
        strokeOpacity={0.85}
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      <circle cx={g.hand.tip.x} cy={g.hand.tip.y} r={0.75} fill="var(--text)" />

      {/* Centre disc — the R result. */}
      <circle cx={c} cy={c} r={g.disc.r} fill={DISC_FILL[g.disc.tone]} />
    </svg>
  );
}
