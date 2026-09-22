'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useExplain } from './ExplainProvider';

export interface ExplainButtonProps {
  /** Key into the explain index. */
  explainId: string;
  /**
   * Accessible name. The visible content is often a bare figure, so the label
   * says what the figure is — and, on the dial, carries the whole text
   * alternative (§16).
   */
  label: string;
  children: ReactNode;
  className?: string;
  /** Keeps the dotted rule off elements that already carry their own border. */
  bare?: boolean;
}

/**
 * Wraps a number in the affordance that opens its explanation.
 *
 * A real `<button>` (§16): focusable, in the tab order, announced with its own
 * name, and carrying the engraved dotted rule that marks every explainable
 * figure on the page.
 */
export function ExplainButton({
  explainId,
  label,
  children,
  className,
  bare = false,
}: ExplainButtonProps) {
  const { open } = useExplain();

  return (
    <button
      type="button"
      onClick={() => {
        open(explainId);
      }}
      aria-haspopup="dialog"
      aria-label={`${label}. Explain this number.`}
      className={cn(
        'group inline-flex max-w-full cursor-pointer items-baseline gap-1.5 text-left',
        'transition-colors duration-200 hover:text-gold-light',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold',
        bare ? '' : 'explainable hover:border-gold',
        className,
      )}
    >
      {children}
    </button>
  );
}
