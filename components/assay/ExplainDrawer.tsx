'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Label } from '@/components/ui';
import type { ExplainEntry, ExplainTone } from './explain-types';

const TONE_CLASS: Record<ExplainTone, string> = {
  gold: 'text-gold',
  loss: 'text-oxblood-text',
  profit: 'text-jade',
  neutral: 'text-text',
};

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
          <div className="flex flex-col gap-2">
            <span
              className={cn(
                'font-serif text-5xl leading-none',
                TONE_CLASS[entry.valueTone],
              )}
            >
              {entry.value}
            </span>
            {entry.valueCaption !== null ? (
              <span className="font-mono text-xs text-text-3">{entry.valueCaption}</span>
            ) : null}
          </div>

          <p className="mt-6 text-sm leading-relaxed text-text-2">{entry.definition}</p>

          <section className="mt-6">
            <Label>Formula</Label>
            <p className="mt-3 rounded-xl border border-line bg-bg px-4 py-3 font-mono text-xs leading-relaxed text-text-2">
              {entry.formula}
            </p>
            <p className="mt-2 text-[11px] tracking-[1px] text-text-3">{entry.source}</p>
          </section>

          {entry.lines.length > 0 ? (
            <section className="mt-7">
              <Label>{entry.linesTitle ?? 'Breakdown'}</Label>
              <dl className="mt-3 flex flex-col">
                {entry.lines.map((line) => (
                  <div
                    key={`${line.label}-${line.value}`}
                    className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
                  >
                    <dt className="text-sm text-text-2">{line.label}</dt>
                    <dd
                      className={cn(
                        'shrink-0 font-mono text-sm tabular-nums',
                        TONE_CLASS[line.tone ?? 'neutral'],
                      )}
                    >
                      {line.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {entry.rows.length > 0 ? (
            <section className="mt-7">
              <Label>{entry.rowsTitle ?? 'The trades behind it'}</Label>
              <table className="mt-3 w-full border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <th
                      scope="col"
                      className="py-2 text-left text-[11px] uppercase tracking-[2px] text-text-3"
                    >
                      Time
                    </th>
                    <th
                      scope="col"
                      className="py-2 pl-3 text-right text-[11px] uppercase tracking-[2px] text-text-3"
                    >
                      R
                    </th>
                    <th
                      scope="col"
                      className="py-2 pl-4 text-left text-[11px] uppercase tracking-[2px] text-text-3"
                    >
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entry.rows.map((row) => (
                    <tr key={row.tradeId} className="border-b border-line last:border-b-0">
                      <td className="py-2 font-mono text-xs whitespace-nowrap text-text-2">
                        {row.time}
                      </td>
                      <td
                        className={cn(
                          'py-2 pl-3 text-right font-mono text-xs tabular-nums whitespace-nowrap',
                          TONE_CLASS[row.tone],
                        )}
                      >
                        {row.r}
                      </td>
                      <td className="py-2 pl-4 text-xs text-text-3">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entry.rowsNote !== null ? (
                <p className="mt-3 text-[11px] text-text-3">{entry.rowsNote}</p>
              ) : null}
            </section>
          ) : null}

          {entry.confidence !== null ? (
            <section className="mt-7">
              <Label>Confidence</Label>
              <div className="mt-3 rounded-xl border border-line bg-bg px-4 py-4">
                <span className="inline-flex items-center rounded-full border border-gold/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[2px] text-gold">
                  {entry.confidence.label}
                </span>
                <dl className="mt-3 flex flex-col gap-1.5 font-mono text-xs text-text-2">
                  <div>{entry.confidence.sample}</div>
                  <div>{entry.confidence.interval}</div>
                  <div>{entry.confidence.winRate}</div>
                  <div>{entry.confidence.pValue}</div>
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-text-3">
                  {entry.confidence.meaning}
                </p>
              </div>
            </section>
          ) : null}

          {entry.note !== null ? (
            <p className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-text-3">
              {entry.note}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
