import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Label } from './Label';

export type StatTone = 'neutral' | 'gold' | 'profit' | 'loss';

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  /** Uppercase caption above the value. */
  label: string;
  /** The value itself — already formatted by `lib/format.ts`. */
  value: ReactNode;
  /** Optional change indicator, e.g. "+0.8K vs last week". */
  delta?: ReactNode;
  /**
   * Direction of the delta. `up` is jade, `down` is oxblood, `flat` is
   * tertiary text. Only ever used for P&L-like movement (CLAUDE.md §9).
   */
  deltaDirection?: 'up' | 'down' | 'flat';
  /** Colour of the value. Default neutral. */
  tone?: StatTone;
  /** Renders the value in mono rather than the display serif. */
  mono?: boolean;
}

const TONE_CLASS: Record<StatTone, string> = {
  neutral: 'text-text',
  gold: 'text-gold',
  profit: 'text-jade',
  loss: 'text-oxblood-text',
};

const DELTA_CLASS: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-jade',
  down: 'text-oxblood-text',
  flat: 'text-text-3',
};

/** Label + large value + optional delta. */
export function Stat({
  label,
  value,
  delta,
  deltaDirection = 'flat',
  tone = 'neutral',
  mono = false,
  className,
  ...props
}: StatProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      <Label>{label}</Label>
      <span
        className={cn(
          'leading-none',
          mono ? 'font-mono text-3xl' : 'font-serif text-4xl',
          TONE_CLASS[tone],
        )}
      >
        {value}
      </span>
      {delta ? (
        <span
          className={cn(
            'font-mono text-xs leading-none',
            DELTA_CLASS[deltaDirection],
          )}
        >
          {delta}
        </span>
      ) : null}
    </div>
  );
}
