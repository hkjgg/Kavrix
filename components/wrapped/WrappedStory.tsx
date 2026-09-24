'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { SceneInView } from '@/components/ui/Scene';
import { storyKey } from './story';

/**
 * Wrapped's pace (CLAUDE.md §17 Stage 7): one chapter at a time, and the
 * reader decides when the next one comes. Click or tap anywhere that is not a
 * control, → or a swipe left to advance; ← or a swipe right to go back; Home
 * and End for the ends; Esc to leave. No autoplay.
 *
 * Every chapter is server-rendered markup handed in as `chapters`; this only
 * decides which one shows. The others carry `data-inactive` (display: none,
 * out of the accessibility tree), which is also what restarts a chapter's
 * reveal: a CSS animation begins when its element is displayed. Not the
 * `hidden` attribute — Tailwind's preflight pins that with a layered
 * `!important` that the no-script fallback could never undo. Without
 * JavaScript, `@media (scripting: none)` and a `<noscript>` style show every
 * chapter, one after another, and hide the controls.
 *
 * Focus stays where the reader put it — pressing Next again must keep working
 * — unless the chapter that held it has just been hidden; then it moves to the
 * new chapter's heading. A polite live region names each chapter as it comes.
 */

export interface StoryChapter {
  id: string;
  number: string;
  title: string;
  headingId: string;
}

export interface WrappedStoryProps {
  chapters: readonly StoryChapter[];
  children: readonly ReactNode[];
  /** Where Esc and the close button go. */
  exitHref: string;
}

const SWIPE_MIN_PX = 48;
const INTERACTIVE = 'a, button, input, select, textarea, summary, label, [role="button"], [data-no-advance]';

export function WrappedStory({ chapters, children, exitHref }: WrappedStoryProps) {
  const [index, setIndex] = useState(0);
  // Nothing is announced until the reader has moved: the first chapter is the page.
  const [moved, setMoved] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const count = chapters.length;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      setIndex((current) => (current === clamped ? current : clamped));
      setMoved(true);
    },
    [count],
  );

  // After a move: name the chapter, bring its top into view, and rescue focus
  // if it was left inside a chapter that is now hidden.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const chapter = chapters[index];
    if (chapter === undefined) return;
    window.scrollTo({ top: 0 });
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('[data-inactive]') !== null) {
      document.getElementById(chapter.headingId)?.focus({ preventScroll: true });
    }
  }, [index, chapters, count]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null) return;
      const action = storyKey(event.key);
      if (action === null) return;
      event.preventDefault();
      if (action === 'exit') {
        // The header's own exit link, so leaving is the same client-side
        // navigation as clicking it; the plain URL if it is not there.
        const exit = document.querySelector<HTMLAnchorElement>('[data-wrapped-exit]');
        if (exit !== null) exit.click();
        else window.location.assign(exitHref);
      }
      else if (action === 'next') go(index + 1);
      else if (action === 'previous') go(index - 1);
      else if (action === 'first') go(0);
      else go(count - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [go, index, count, exitHref]);

  const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntil.current) return;
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE) !== null) return;
    // Selecting a sentence is reading, not a request for the next chapter.
    const selection = window.getSelection();
    if (selection !== null && selection.toString().length > 0) return;
    go(index + 1);
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const point = event.touches[0];
    touch.current = point === undefined ? null : { x: point.clientX, y: point.clientY };
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touch.current;
    const point = event.changedTouches[0];
    touch.current = null;
    if (start === null || point === undefined) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    suppressClickUntil.current = Date.now() + 450;
    go(dx < 0 ? index + 1 : index - 1);
  };

  const current = chapters[index];
  const announced = moved && current !== undefined ? `Chapter ${index + 1} of ${count}: ${current.title}` : '';
  const button =
    'inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[11px] font-medium uppercase tracking-[2px] text-text-2 transition-colors enabled:hover:border-gold enabled:hover:text-gold disabled:cursor-default disabled:opacity-35';

  return (
    <div className="wrapped-story flex flex-1 flex-col">
      {/* The thin gold progress line, with a notch at each chapter. */}
      <div
        className="wrapped-progress relative h-px w-full bg-line"
        role="progressbar"
        aria-label="Chapter"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={index + 1}
        aria-valuetext={current === undefined ? undefined : `Chapter ${index + 1} of ${count}: ${current.title}`}
      >
        <span className="wrapped-progress-fill absolute inset-y-0 left-0 block bg-gold" style={{ width: `${((index + 1) / count) * 100}%` }} />
        {chapters.slice(1).map((chapter, notch) => (
          <span
            key={chapter.id}
            aria-hidden="true"
            className="absolute top-[-2px] block h-[5px] w-px bg-bg"
            style={{ left: `${((notch + 1) / count) * 100}%` }}
          />
        ))}
      </div>

      <div
        className="wrapped-stage flex flex-1 flex-col"
        onClick={onStageClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children.map((child, position) => {
          const chapter = chapters[position];
          if (chapter === undefined) return null;
          const active = position === index;
          return (
            <SceneInView key={chapter.id} inView={active}>
              <section
                id={chapter.id}
                aria-labelledby={chapter.headingId}
                data-inactive={active ? undefined : ''}
                className="wrapped-chapter"
                data-chapter={chapter.id}
              >
                {child}
              </section>
            </SceneInView>
          );
        })}
      </div>

      <nav aria-label="Chapters" className="wrapped-controls sticky bottom-0 z-20 border-t border-line bg-bg">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-8">
          <button type="button" className={button} onClick={() => go(index - 1)} disabled={index === 0}>
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">Back</span>
            <span className="sr-only sm:hidden">Back</span>
          </button>
          <p className="truncate text-center text-[11px] text-text-3">
            <span className="font-mono text-text-2">
              {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            </span>
            <span className="hidden sm:inline"> · {current?.title}</span>
            <span className="ml-3 hidden text-text-3 lg:inline">Click, → or swipe to go on · ← back · Esc to leave</span>
          </p>
          <button type="button" className={button} onClick={() => go(index + 1)} disabled={index === count - 1}>
            <span className="hidden sm:inline">Next</span>
            <span className="sr-only sm:hidden">Next</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </nav>

      <p aria-live="polite" className="sr-only">
        {announced}
      </p>
    </div>
  );
}
