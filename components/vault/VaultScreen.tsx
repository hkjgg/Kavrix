'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Scene } from '@/components/ui';
import { useLocationSearch } from '@/components/ledger/useLocationSearch';
import { Ingot, IngotSlot, ShelfOnly, type ShelfEdge } from '@/components/viz/Ingot';
import { formatKarat, formatMoney, formatR } from '@/lib/format';
import { WEEKDAYS_MONDAY_FIRST, longDate, shortDate, shortWeekdayDate } from '@/lib/dates';
import { DayAssay } from './DayAssay';
import type { VaultDay, VaultMonth, VaultView } from './vault';
import { moveDate, stepAssayDay } from './vault';

/**
 * The Vault (CLAUDE.md §8.7) — the history as shelves of bullion.
 *
 * Each month is a shelf of weeks, Monday first, so the weekday columns line
 * up from shelf to shelf. A trading day is a cast ingot: its **metal is the
 * day's Karat** — rich gold at 24K down to matte slate for Raw Ore — with the
 * Karat struck into the top face, and a 2px **assay strip** under it for the
 * day's P&L, jade or oxblood, against the month's largest day. A day with no
 * trades is a faint slot recessed into the shelf.
 *
 * One tab stop for the whole calendar: arrows move between days (a week up
 * or down, a day either side), Home and End go to the ends of the history,
 * Enter opens the day's Day Assay, and Esc closes it. While a Day Assay is
 * open it follows the selection. The open day lives in the URL
 * (`?day=2026-07-15`), so a day can be linked.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WIDE = '(min-width: 1280px)';

/** The open day from the query string, when it is a day of the history. */
export function parseVaultDay(search: string, firstDate: string, lastDate: string): string | null {
  const day = new URLSearchParams(search).get('day');
  if (day === null || !DATE_PATTERN.test(day)) return null;
  if (day < firstDate || day > lastDate) return null;
  return day;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What a day is called to a screen reader: every figure its tooltip shows. */
export function dayLabel(day: VaultDay, currency: string): string {
  const date = longDate(day.date);
  if (day.kind === 'quiet') return `${date}: no trades.`;
  const trades =
    day.manualTradeCount === day.tradeCount
      ? plural(day.tradeCount, 'trade')
      : `${plural(day.tradeCount, 'trade')}, ${day.manualTradeCount} manual`;
  const karat =
    day.karat === null
      ? 'no manual trades, no day Karat'
      : `day Karat ${formatKarat(day.karat)}, ${day.tierLabel ?? ''}`;
  const mark = day.mark === 'best' ? ' Best day of the month.' : day.mark === 'worst' ? ' Worst day of the month.' : '';
  return `${date}: ${trades}. Net ${formatMoney(day.netMoney, { currency, signed: true })}, ${formatR(
    day.netR,
  )}. ${karat}, ${plural(day.impurityCount, 'impurity', 'impurities')}.${mark}`;
}

function shelfEdge(column: number): ShelfEdge {
  if (column === 0) return 'start';
  if (column === 6) return 'end';
  return 'middle';
}

/** The micro-tooltip: hover or keyboard focus only, 120 ms in, fade only. */
function Tooltip({ day, currency }: { day: VaultDay; currency: string }) {
  // Open towards the middle of the shelf so the edge columns stay on screen.
  const align =
    day.column <= 1 ? 'left-0' : day.column >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none invisible absolute bottom-full z-20 mb-1 w-52 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-left opacity-0',
        'transition-[opacity,visibility] duration-150',
        'peer-hover:visible peer-hover:opacity-100 peer-hover:delay-[120ms] peer-focus-visible:visible peer-focus-visible:opacity-100 peer-focus-visible:delay-[120ms]',
        align,
      )}
    >
      <span className="block text-[10px] font-medium uppercase tracking-[2px] text-text-3">
        {shortWeekdayDate(day.date)}
      </span>
      {day.kind === 'quiet' ? (
        <span className="mt-1.5 block text-xs text-text-2">No trades</span>
      ) : (
        <>
          <span className="mt-1.5 flex items-baseline gap-2">
            <span className="font-serif text-lg leading-none text-gold">
              {day.karat === null ? '—' : formatKarat(day.karat)}
            </span>
            <span className="text-[10px] uppercase tracking-[1.5px] text-text-3">{day.tierLabel ?? 'EA only'}</span>
          </span>
          <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
            <span className="text-text-3">Net</span>
            <span className={cn('text-right', day.netMoney >= 0 ? 'text-jade' : 'text-oxblood-text')}>
              {formatMoney(day.netMoney, { currency, signed: true })}
            </span>
            <span className="text-text-3">R</span>
            <span className={cn('text-right', day.netR >= 0 ? 'text-jade' : 'text-oxblood-text')}>
              {formatR(day.netR)}
            </span>
            <span className="text-text-3">Trades</span>
            <span className="text-right text-text">
              {day.tradeCount}
              {day.manualTradeCount !== day.tradeCount ? (
                <span className="text-text-3"> · {day.manualTradeCount} manual</span>
              ) : null}
            </span>
            <span className="text-text-3">Impurities</span>
            <span className="text-right text-text">{day.impurityCount}</span>
          </span>
        </>
      )}
    </span>
  );
}

interface DayCellProps {
  day: VaultDay;
  currency: string;
  active: boolean;
  open: boolean;
  onOpen: (date: string) => void;
  register: (date: string, node: HTMLButtonElement | null) => void;
}

function DayCell({ day, currency, active, open, onOpen, register }: DayCellProps) {
  return (
    <div className="relative">
      <button
        type="button"
        ref={(node) => {
          register(day.date, node);
        }}
        tabIndex={active ? 0 : -1}
        aria-pressed={open}
        aria-controls="vault-replay-panel"
        aria-label={`${dayLabel(day, currency)} Open the Day Assay.`}
        data-date={day.date}
        data-kind={day.kind}
        data-mark={day.mark ?? undefined}
        onClick={() => {
          onOpen(day.date);
        }}
        className="vault-day peer block w-full cursor-pointer rounded-md px-0 pt-1 text-left focus-visible:outline-offset-0"
      >
        <span
          aria-hidden="true"
          className={cn(
            'block px-1.5 font-mono text-[9px] leading-3 transition-colors',
            open ? 'text-gold' : 'text-text-3',
          )}
        >
          {day.day}
        </span>
        {day.kind === 'trading' ? (
          <Ingot
            tier={day.tier}
            karat={day.karat}
            strip={day.strip}
            mark={day.mark}
            selected={open}
            shelf={shelfEdge(day.column)}
          />
        ) : (
          <IngotSlot shelf={shelfEdge(day.column)} />
        )}
      </button>
      <Tooltip day={day} currency={currency} />
    </div>
  );
}

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] font-medium uppercase tracking-[1.5px] text-text-3">{label}</dt>
      <dd className="font-mono text-[11px] text-text-2">{children}</dd>
    </div>
  );
}

interface ShelfProps {
  month: VaultMonth;
  currency: string;
  focusDate: string;
  openDate: string | null;
  onOpen: (date: string) => void;
  register: (date: string, node: HTMLButtonElement | null) => void;
}

function Shelf({ month, currency, focusDate, openDate, onOpen, register }: ShelfProps) {
  const titleId = `vault-shelf-${month.key}`;
  const { summary } = month;
  return (
    <Scene aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h2 id={titleId} className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] tracking-[2px] text-gold">{month.key.slice(5)}</span>
          <span aria-hidden="true" className="text-text-3">
            —
          </span>
          <span className="font-serif text-3xl leading-none text-text">{month.label}</span>
        </h2>
        {summary.averageKarat !== null ? (
          <span
            className="engraved inline-flex items-baseline gap-2 rounded-md px-2.5 py-1"
            data-average-tier={summary.averageTier ?? undefined}
          >
            <span className="text-[9px] font-medium uppercase tracking-[2px] text-text-3">Avg day Karat</span>
            <span className="font-serif text-xl leading-none text-gold [text-shadow:0_-1px_0_rgb(255_255_255/0.12),0_1px_0_rgb(0_0_0/0.8)]">
              {formatKarat(summary.averageKarat)}
            </span>
          </span>
        ) : null}
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
        <SummaryItem label="Trading days">{summary.tradingDays}</SummaryItem>
        <SummaryItem label="Net R">
          <span className={summary.netR >= 0 ? 'text-jade' : 'text-oxblood-text'}>{formatR(summary.netR)}</span>
        </SummaryItem>
        <SummaryItem label="Best day">
          {summary.best === null ? (
            '—'
          ) : (
            <>
              <span className={summary.best.netMoney >= 0 ? 'text-jade' : 'text-oxblood-text'}>
                {formatMoney(summary.best.netMoney, { currency, signed: true })}
              </span>
              <span className="text-text-3"> · {shortDate(summary.best.date)}</span>
            </>
          )}
        </SummaryItem>
        <SummaryItem label="Worst day">
          {summary.worst === null ? (
            '—'
          ) : (
            <>
              <span className={summary.worst.netMoney >= 0 ? 'text-jade' : 'text-oxblood-text'}>
                {formatMoney(summary.worst.netMoney, { currency, signed: true })}
              </span>
              <span className="text-text-3"> · {shortDate(summary.worst.date)}</span>
            </>
          )}
        </SummaryItem>
      </dl>

      <div aria-hidden="true" className="grid grid-cols-7">
        {WEEKDAYS_MONDAY_FIRST.map((name) => (
          <span
            key={name}
            className="px-1.5 text-[9px] font-medium uppercase tracking-[1.5px] text-text-3 sm:text-[10px]"
          >
            <span className="sm:hidden">{name.slice(0, 1)}</span>
            <span className="hidden sm:inline">{name.slice(0, 3)}</span>
          </span>
        ))}
      </div>

      <div className="relative -mt-2 flex flex-col gap-1">
        {month.weeks.map((week, weekIndex) => (
          <div key={`${month.key}-${weekIndex}`} className="grid grid-cols-7">
            {week.map((day, column) =>
              day === null ? (
                <div key={column} aria-hidden="true" className="pt-1">
                  <span className="block h-3" />
                  <ShelfOnly shelf={shelfEdge(column)} />
                </div>
              ) : (
                <DayCell
                  key={day.date}
                  day={day}
                  currency={currency}
                  active={day.date === focusDate}
                  open={day.date === openDate}
                  onOpen={onOpen}
                  register={register}
                />
              ),
            )}
          </div>
        ))}
        {/* One slow pass of light along the shelf, the first time it is seen. */}
        <span aria-hidden="true" className="shelf-sweep enter-shelf-sweep" />
      </div>
    </Scene>
  );
}

export function VaultScreen({ view }: { view: VaultView }) {
  const [search, replaceSearch] = useLocationSearch();
  const openDate = parseVaultDay(search, view.firstDate, view.lastDate);

  const days = useMemo(
    () => view.months.flatMap((month) => month.weeks.flat()).filter((day): day is VaultDay => day !== null),
    [view.months],
  );
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const assayDates = useMemo(() => Object.keys(view.assays).sort(), [view.assays]);
  const lastTrading = useMemo(
    () => [...days].reverse().find((day) => day.kind === 'trading')?.date ?? view.lastDate,
    [days, view.lastDate],
  );

  // The roving tab stop. Until the reader moves it, it sits on the open day,
  // or on the last day that traded.
  const [cursor, setCursor] = useState<string | null>(null);
  const focusDate = cursor ?? openDate ?? lastTrading;

  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const register = useCallback((date: string, node: HTMLButtonElement | null) => {
    if (node === null) buttons.current.delete(date);
    else buttons.current.set(date, node);
  }, []);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const reveal = useRef<'auto' | 'heading' | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const open = useCallback(
    (date: string, reveal_: 'auto' | 'heading' = 'auto') => {
      setCursor(date);
      reveal.current = reveal_;
      replaceSearch(`day=${date}`);
      const assay = view.assays[date];
      setAnnouncement(
        assay === undefined
          ? `Day Assay for ${longDate(date)}: no manual trades.`
          : `Day Assay for ${longDate(date)}: ${plural(assay.tradeCount, 'trade')}, day Karat ${formatKarat(
              assay.karat,
            )}, ${plural(assay.chapters.length, 'chapter')}.`,
      );
    },
    [replaceSearch, view.assays],
  );

  const close = useCallback(() => {
    const date = openDate;
    replaceSearch('');
    setAnnouncement('Day Assay closed.');
    if (date !== null) {
      setCursor(date);
      buttons.current.get(date)?.focus();
    }
  }, [openDate, replaceSearch]);

  const step = useCallback(
    (direction: -1 | 1) => {
      if (openDate === null) return;
      const next = stepAssayDay(openDate, direction, assayDates);
      if (next !== null) open(next, 'heading');
    },
    [assayDates, open, openDate],
  );

  // Beside the calendar (wide screens) focus stays on the day, so the arrows
  // keep walking the week. As a sheet (phones, narrow windows) the Day Assay
  // takes focus. Stepping from inside the panel always lands on its heading.
  useEffect(() => {
    const how = reveal.current;
    if (how === null || openDate === null) return;
    reveal.current = null;
    const wide = typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches;
    if (how === 'heading' || !wide) headingRef.current?.focus({ preventScroll: true });
  }, [openDate]);

  // As a sheet, the page behind it holds still.
  useEffect(() => {
    if (openDate === null) return;
    if (typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [openDate]);

  // Esc closes the Day Assay from anywhere on the page — unless the panel
  // used it first, to let go of a highlight.
  useEffect(() => {
    if (openDate === null) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [openDate, close]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const from = target.dataset.date;
    if (from === undefined) return;
    const next = moveDate(from, event.key, view.firstDate, view.lastDate);
    if (next === null) return;
    event.preventDefault();
    setCursor(next);
    buttons.current.get(next)?.focus();
    // An open Day Assay follows the selection.
    if (openDate !== null && next !== openDate) open(next);
  };

  const openDay = openDate === null ? null : (byDate.get(openDate) ?? null);

  return (
    <div className="grid grid-cols-1 gap-14 xl:grid-cols-[minmax(0,620px)_minmax(0,1fr)] xl:gap-12">
      <div
        role="group"
        aria-label="Days of the history"
        aria-describedby="vault-keys"
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-col gap-14"
      >
        <p id="vault-keys" className="sr-only">
          Arrow keys move between days, a week up or down and a day either side. Home and End go to
          the first and last day. Enter opens the day&rsquo;s Day Assay; Escape closes it.
        </p>
        {view.months.map((month) => (
          <Shelf
            key={month.key}
            month={month}
            currency={view.currency}
            focusDate={focusDate}
            openDate={openDate}
            onOpen={open}
            register={register}
          />
        ))}
      </div>

      {openDate !== null ? (
        <div aria-hidden="true" onClick={close} className="veil-in fixed inset-0 z-40 bg-black/65 xl:hidden" />
      ) : null}

      <div
        id="vault-replay-panel"
        className={cn(
          openDate === null
            ? 'hidden xl:block'
            : 'sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto overscroll-contain',
          'xl:sticky xl:inset-auto xl:top-24 xl:z-auto xl:max-h-[calc(100dvh-7rem)] xl:animate-none xl:self-start xl:overflow-y-auto',
        )}
      >
        {openDate === null ? (
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-1 p-5 sm:p-6">
            <span className="text-[11px] font-medium uppercase tracking-[3px] text-text-3">Day Assay</span>
            <p className="font-serif text-xl leading-snug text-text-2">
              Choose a day to assay it: the chart, the chapters, the bill.
            </p>
            <p className="text-xs leading-relaxed text-text-3">
              Arrows move between days · Enter opens · Esc closes
            </p>
            {view.worst !== null ? (
              <button
                type="button"
                onClick={() => {
                  if (view.worst !== null) open(view.worst.date);
                }}
                className="self-start border-b border-dotted border-gold/50 pb-0.5 text-left text-xs text-gold transition-colors hover:border-gold hover:text-gold-light"
              >
                Open the worst tilt of the history — {shortWeekdayDate(view.worst.date)},{' '}
                {view.worst.start.slice(11, 16)} UTC
              </button>
            ) : null}
          </div>
        ) : (
          <DayAssay
            key={openDate}
            date={openDate}
            assay={view.assays[openDate] ?? null}
            vaultDay={openDay}
            currency={view.currency}
            sessions={view.sessions}
            onClose={close}
            onStep={step}
            canStep={{
              previous: stepAssayDay(openDate, -1, assayDates) !== null,
              next: stepAssayDay(openDate, 1, assayDates) !== null,
            }}
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
