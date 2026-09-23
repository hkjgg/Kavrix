'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Scene } from '@/components/ui';
import { useLocationSearch } from '@/components/ledger/useLocationSearch';
import { Constellation } from '@/components/viz/Constellation';
import type { ConstellationView } from './constellation';
import { EaPanel } from './EaPanel';

/**
 * The Constellation screen (Stage 6): the sky and the EA panel beside it.
 *
 * The open EA lives in the URL (`?ea=1003`), so an EA can be linked, and it is
 * written with `replaceState` — opening a star is not a navigation. Beside the
 * sky (≥ 1280 px) the panel is sticky and focus stays on the star; below that
 * it is a bottom sheet with a backdrop, the page behind it holds still and its
 * heading takes focus. Esc closes from anywhere, and focus returns to the star.
 */

const WIDE = '(min-width: 1280px)';

/** The open EA from the query string, when it is one of the EAs shown. */
export function parseOpenEa(search: string, magics: readonly number[]): number | null {
  const raw = new URLSearchParams(search).get('ea');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const magic = Number(raw);
  return magics.includes(magic) ? magic : null;
}

export function ConstellationScreen({ view }: { view: ConstellationView }) {
  const [search, replaceSearch] = useLocationSearch();
  const magics = useMemo(() => view.stars.map((star) => star.magic), [view.stars]);
  const openMagic = parseOpenEa(search, magics);
  const [announcement, setAnnouncement] = useState('');

  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reveal = useRef(false);

  const register = useCallback((magic: number, node: HTMLButtonElement | null) => {
    if (node === null) buttons.current.delete(magic);
    else buttons.current.set(magic, node);
  }, []);

  const open = useCallback(
    (magic: number) => {
      reveal.current = true;
      replaceSearch(`ea=${magic}`);
      const panel = view.panels[String(magic)];
      if (panel !== undefined) {
        setAnnouncement(
          `${panel.name} opened: Fineness ${panel.finenessText}, ${panel.labelText}${panel.drift.alert ? ', drifting' : ''}.`,
        );
      }
    },
    [replaceSearch, view.panels],
  );

  const close = useCallback(() => {
    const magic = openMagic;
    replaceSearch('');
    setAnnouncement('EA panel closed.');
    if (magic !== null) buttons.current.get(magic)?.focus();
  }, [openMagic, replaceSearch]);

  // As a sheet the panel takes focus; beside the sky focus stays on the star.
  useEffect(() => {
    if (!reveal.current || openMagic === null) return;
    reveal.current = false;
    const wide = typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches;
    if (!wide) headingRef.current?.focus({ preventScroll: true });
  }, [openMagic]);

  // As a sheet, the page behind it holds still.
  useEffect(() => {
    if (openMagic === null) return;
    if (typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [openMagic]);

  useEffect(() => {
    if (openMagic === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [openMagic, close]);

  const panel = openMagic === null ? null : (view.panels[String(openMagic)] ?? null);

  return (
    <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:gap-10">
      <Scene aria-label="The sky" className="flex min-w-0 flex-col gap-4">
        <div className="overflow-hidden rounded-card border border-line bg-surface-1">
          <Constellation
            width={view.width}
            height={view.height}
            stars={view.stars}
            threads={view.threads}
            field={view.field}
            selected={openMagic}
            onOpen={open}
            register={register}
            alt={view.alt}
          />
        </div>
        <ul
          aria-label="How to read the sky"
          className="flex flex-wrap gap-x-6 gap-y-2.5 text-[11px] text-text-3"
        >
          <li className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="26" height="12" viewBox="0 0 26 12">
              <circle cx="6" cy="6" r="3" fill="var(--gold-light)" />
              <circle cx="20" cy="6" r="3" fill="var(--gold-deep)" opacity="0.55" />
            </svg>
            Brightness is Fineness: bright is Fine, dim is Degraded
          </li>
          <li className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="24" height="12" viewBox="0 0 24 12">
              <circle cx="5" cy="6" r="2" fill="var(--gold)" />
              <circle cx="17" cy="6" r="5" fill="var(--gold)" />
            </svg>
            Size is volume traded
          </li>
          <li className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="2.5" fill="var(--gold-deep)" />
              <circle cx="7" cy="7" r="6" fill="none" stroke="var(--news)" strokeWidth="1" />
            </svg>
            Amber ring: drifting
          </li>
          <li className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="22" height="8" viewBox="0 0 22 8">
              <line x1="1" y1="2.5" x2="21" y2="2.5" stroke="var(--gold)" strokeWidth="0.8" />
              <line x1="1" y1="5.5" x2="21" y2="5.5" stroke="var(--gold)" strokeWidth="0.8" />
            </svg>
            Threads: positive daily P&amp;L correlation, opacity = strength; doubled for a same bet (≥{' '}
            {view.sameBetThreshold})
          </li>
          <li>Closer stars move together more (distance = 1 − correlation)</li>
        </ul>
      </Scene>

      {panel !== null ? (
        <div aria-hidden="true" onClick={close} className="veil-in fixed inset-0 z-40 bg-black/65 xl:hidden" />
      ) : null}

      <div
        className={cn(
          panel === null
            ? 'hidden xl:block'
            : 'sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto overscroll-contain',
          'xl:sticky xl:inset-auto xl:top-24 xl:z-auto xl:max-h-[calc(100dvh-7rem)] xl:animate-none xl:self-start xl:overflow-y-auto',
        )}
      >
        {panel === null ? (
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-1 p-5 sm:p-6">
            <span className="text-[11px] font-medium uppercase tracking-[3px] text-text-3">EA Health</span>
            <p className="font-serif text-xl leading-snug text-text-2">
              Choose a star to assay its EA: the Fineness, the drift, the company it keeps.
            </p>
            <p className="text-xs leading-relaxed text-text-3">Tab moves between stars · Enter opens · Esc closes</p>
            {view.drifting !== null ? (
              <button
                type="button"
                onClick={() => {
                  if (view.drifting !== null) open(view.drifting.magic);
                }}
                className="self-start border-b border-dotted border-gold/50 pb-0.5 text-left text-xs text-gold transition-colors hover:border-gold hover:text-gold-light"
              >
                Open the drifting EA — {view.drifting.name}
              </button>
            ) : null}
          </div>
        ) : (
          <EaPanel
            key={panel.magic}
            panel={panel}
            onClose={close}
            headingRef={headingRef}
            className="max-xl:rounded-b-none max-xl:border-b-0"
          />
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
