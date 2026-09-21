import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'gold' | 'neutral' | 'profit' | 'loss' | 'news';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  gold: 'border-gold/40 text-gold',
  neutral: 'border-line text-text-3',
  profit: 'border-jade/40 text-jade',
  loss: 'border-oxblood/40 text-oxblood-text',
  news: 'border-news/40 text-news',
};

/** Small pill for states and provenance, e.g. "Demo data". */
export function Badge({ tone = 'gold', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1',
        'text-[11px] font-medium uppercase leading-none tracking-[2px]',
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  );
}
