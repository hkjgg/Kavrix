'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Label } from '@/components/ui';
import { ExplainBody } from './ExplainBody';
import type { ExplainEntry } from './explain-types';

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ExplainDrawerProps {
  /** `null` while nothing is open — the drawer unmounts rather than hiding. */
  entry: ExplainEntry | null;
  onClose: () => void;
}

/**
 * The right-side drawer behind every number on the Assay (Stage 3).
 *
 * Accessibility is the feature here, not a finish: a real dialog, focus moved
 * in on open and returned on close, Tab trapped inside, Esc closes, and the
 * page behind it locked from scrolling. It is unmounted when closed, so its
 * content is never in the tab order by accident.
 */
export function ExplainDrawer({ entry, onClose }: ExplainDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const open = entry !== null;

  /* Focus in on open, back where it came from on close. */
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      previous?.focus?.();
    };
  }, [open]);

  /* Esc closes; Tab cycles inside the panel. */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onClose]);

  /* The page behind a modal does not scroll. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (entry === null) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close explanation"
        tabIndex={-1}
        onClick={onClose}
        className="veil-in absolute inset-0 h-full w-full cursor-default bg-bg/80"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'drawer-in absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col',
          'border-l border-line bg-surface-1',
        )}
      >
        <header className="flex items-start gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0 flex-1">
            <Label>{entry.eyebrow}</Label>
            <h2 id={titleId} className="mt-3 font-serif text-2xl leading-tight text-text">
              {entry.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close explanation"
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full border border-line',
              'text-text-3 transition-colors hover:border-gold hover:text-gold',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
            )}
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
              <path
                d="M2 2 L14 14 M14 2 L2 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
          <ExplainBody entry={entry} />
        </div>
      </div>
    </div>
  );
}
