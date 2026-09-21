import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Raised surface, for hover or emphasis. */
  raised?: boolean;
  /** Adds the hairline gold border used on signature cards. */
  engraved?: boolean;
  /** Removes the default padding when the card holds a table or a chart. */
  flush?: boolean;
}

/**
 * The base surface (CLAUDE.md §9): 20px radius, 1px hairline border,
 * surface-1 background, no drop shadow — depth comes from a lighter surface.
 */
export function Card({
  raised = false,
  engraved = false,
  flush = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border',
        raised ? 'bg-surface-2' : 'bg-surface-1',
        engraved ? 'engraved' : 'border-line',
        flush ? '' : 'p-6',
        className,
      )}
      {...props}
    />
  );
}
