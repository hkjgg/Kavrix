import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type LabelProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Caption / field label (CLAUDE.md §9): uppercase, 11px, 3px tracking,
 * in the tertiary text tone.
 *
 * This is a presentational label. For a form control, pass `htmlFor` through
 * a real `<label>` and use this inside it.
 */
export function Label({ className, ...props }: LabelProps) {
  return (
    <span
      className={cn(
        'block text-[11px] font-medium uppercase leading-none tracking-[3px] text-text-3',
        className,
      )}
      {...props}
    />
  );
}
