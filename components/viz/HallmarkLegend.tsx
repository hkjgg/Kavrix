import { cn } from '@/lib/cn';
import { Hallmark } from './Hallmark';
import type { HallmarkInput } from './hallmark';
import { RISK_RING_MULTIPLE, R_CAP } from './hallmark';

/**
 * How to read a Hallmark — six rings, outside in.
 *
 * A native `<details>`: it opens without JavaScript and costs nothing closed.
 * The example glyph is a fixed, labelled illustration, not a trade.
 */

const EXAMPLE: HallmarkInput = {
  rMultiple: 1.6,
  riskPercent: 1.4,
  riskLimitPercent: 1,
  durationSeconds: 42 * 60,
  sessions: ['london', 'newYork'],
  news: 'near',
  newsMinutes: 38,
  stop: 'widened',
};

export interface HallmarkLegendProps {
  riskLimitPercent: number;
  className?: string;
  /** Open on arrival. Default closed. */
  open?: boolean;
}

export function HallmarkLegend({ riskLimitPercent, className, open = false }: HallmarkLegendProps) {
  const limit = `${riskLimitPercent.toFixed(1)}%`;
  const full = `${(riskLimitPercent * RISK_RING_MULTIPLE).toFixed(1)}%`;
  const items: Array<{ ring: string; reads: string }> = [
    {
      ring: 'Bezel · stop',
      reads: 'Solid when a stop was set within 60 s and never widened. Broken when it was widened, dotted when there was none.',
    },
    {
      ring: 'Outer ring · session',
      reads: 'Three arcs: Asia at 10 o’clock (slate), London at 2 (gold), New York at 6 (bronze). An arc is lit when the entry fell in that session.',
    },
    {
      ring: '12 o’clock pip · news',
      reads: 'Filled amber inside the ±15 min window of a high-impact USD release, hollow 15–60 min away, absent when clear.',
    },
    {
      ring: 'Inner arc · risk %',
      reads: `Clockwise from 12. The tick at 4 o’clock is your ${limit} limit; past it the arc turns bright, and it closes the ring at ${full}.`,
    },
    {
      ring: 'Hand · holding time',
      reads: 'A watch hand on a log scale: one minute points at 12, an hour at about 6, a day at 11.',
    },
    {
      ring: 'Centre · R result',
      reads: `Jade for a win, oxblood for a loss. The disc grows with the size of the result, up to ${R_CAP}R.`,
    },
  ];

  return (
    <details className={cn('group rounded-card border border-line bg-surface-1', className)} open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-card px-5 py-4 text-[11px] font-medium uppercase tracking-[2px] text-text-3 hover:text-text-2 [&::-webkit-details-marker]:hidden">
        <Hallmark input={EXAMPLE} size={20} decorative />
        How to read a Hallmark
        <span aria-hidden="true" className="ml-auto font-mono text-xs text-gold transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="grid gap-8 border-t border-line px-5 py-6 sm:grid-cols-[auto_1fr] sm:items-start">
        <figure className="flex flex-col items-center gap-3">
          <Hallmark input={EXAMPLE} size={120} />
          <figcaption className="max-w-[180px] text-center font-mono text-[11px] leading-relaxed text-text-3">
            Example · +1.6R win, 1.4% risk, 42 min, London and New York, 38 min from a release,
            stop widened
          </figcaption>
        </figure>
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.ring} className="flex flex-col gap-1.5">
              <dt className="text-[11px] font-medium uppercase tracking-[2px] text-text-2">{item.ring}</dt>
              <dd className="text-xs leading-relaxed text-text-3">{item.reads}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
