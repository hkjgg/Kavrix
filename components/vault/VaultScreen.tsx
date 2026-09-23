'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { useLocationSearch } from '@/components/ledger/useLocationSearch';
import { formatKarat, formatMoney, formatR } from '@/lib/format';
import { WEEKDAYS_MONDAY_FIRST, longDate, shortDate, shortWeekdayDate } from '@/lib/dates';
import { Replay } from './Replay';
import type { MonthSummary, VaultDay, VaultMonth, VaultView } from './vault';
import { INGOT, ingotBand, ingotBody, karatTone, moveDate } from './vault';

/**
 * The Vault (CLAUDE.md §8.7) — the history as shelves of ingots.
 *
 * Each month is a shelf, each week a row of seven slots, Monday first, so the
 * weekday columns line up from shelf to shelf. A trading day is an ingot:
 * filled from its midline by the day's P&L — jade up for a profit, oxblood
 * down for a loss — and engraved with the day's Karat. A day with no trades
 * is an empty slot.
 *
 * One tab stop for the whole calendar: arrows move between days (a week up
 * or down, a day either side), Home and End go to the ends of the history,
 * Enter opens the day's Discipline Replay, and Esc closes it. The open day
 * lives in the URL (`?day=2026-07-15`), so a replay can be linked.
 */

const TONE_CLASS: Record<ReturnType<typeof karatTone>, string> = {
  fine: 'text-gold-light',
  solid: 'text-gold',
  mixed: 'text-text-2',
  raw: 'text-text-3',
  none: 'text-text-3',
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  const karat = day.karat === null ? 'no manual trades, no day Karat' : `day Karat ${formatKarat(day.karat)}`;
  return `${date}: ${trades}. Net ${formatMoney(day.netMoney, { currency, signed: true })}, ${formatR(
    day.netR,
  )}. ${karat}, ${plural(day.impurityCount, 'impurity', 'impurities')}.`;
}

function Ingot({ day }: { day: VaultDay }) {
  const band = ingotBand(day.fill);
  const tone = karatTone(day.karat);
  return (
    <span className="relative block">
      <svg
        viewBox={`0 0 ${INGOT.width} ${INGOT.height}`}
        preserveAspectRatio="none"
        className="block h-7 w-full sm:h-9"
        aria-hidden="true"
      >
        <polygon
          points={ingotBody()}
          fill="var(--surface-2)"
          stroke="var(--gold)"
          strokeOpacity={0.3}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {band !== null ? (
          <polygon
            points={band}
            fill={day.fill.direction === 'up' ? 'var(--jade)' : 'var(--oxblood)'}
            fillOpacity={0.5}
          />
        ) : null}
        <line
          x1={INGOT.inset / 2}
          x2={INGOT.width - INGOT.inset / 2}
          y1={INGOT.height / 2}
          y2={INGOT.height / 2}
          stroke="var(--gold)"
          strokeOpacity={0.22}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {/* The top face catching the light. */}
        <line
          x1={INGOT.inset}
          x2={INGOT.width - INGOT.inset}
          y1={0.5}
          y2={0.5}
          stroke="var(--gold-light)"
          strokeOpacity={0.4}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 flex items-center justify-center font-mono text-[10px] font-medium [text-shadow:0_1px_0_rgb(0_0_0/0.75)] sm:text-[11px]',
          TONE_CLASS[tone],
        )}
      >
        {day.karat === null ? (
          '—'
        ) : (
          <>
            {day.karat.toFixed(1)}
            <span className="hidden sm:inline">K</span>
          </>
        )}
      </span>
    </span>
  );
}

function Tooltip({ day, currency }: { day: VaultDay; currency: string }) {
  // Open towards the middle of the shelf so the edge columns stay on screen.
  const align =
    day.column <= 1 ? 'left-0' : day.column >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bottom-full z-20 mb-2 hidden w-48 rounded-xl border border-line bg-surface-2 p-3 text-left shadow-[0_12px_32px_rgb(0_0_0/0.55)]',
        'peer-hover:block peer-focus-visible:block',
        align,
      )}
    >
      <span className="block text-[10px] font-medium uppercase tracking-[2px] text-text-3">
        {shortWeekdayDate(day.date)}
      </span>
      {day.kind === 'quiet' ? (
        <span className="mt-2 block text-xs text-text-2">No trades</span>
      ) : (
        <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
          <span className="text-text-3">Trades</span>
          <span className="text-right text-text">
            {day.tradeCount}
            {day.manualTradeCount !== day.tradeCount ? (
              <span className="text-text-3"> · {day.manualTradeCount} manual</span>
            ) : null}
          </span>
          <span className="text-text-3">Net</span>
          <span className={cn('text-right', day.netMoney >= 0 ? 'text-jade' : 'text-oxblood-text')}>
            {formatMoney(day.netMoney, { currency, signed: true })}
          </span>
          <span className="text-text-3">Net R</span>
          <span className={cn('text-right', day.netR >= 0 ? 'text-jade' : 'text-oxblood-text')}>
            {formatR(day.netR)}
          </span>
          <span className="text-text-3">Day Karat</span>
          <span className="text-right text-gold">
            {day.karat === null ? '—' : formatKarat(day.karat)}
          </span>
          <span className="text-text-3">Impurities</span>
          <span className="text-right text-text">
            {day.impurityCount}
            <span className="text-text-3"> of {day.manualTradeCount}</span>
          </span>
        </span>
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
        aria-label={`${dayLabel(day, currency)} Open the replay.`}
        data-date={day.date}
        data-kind={day.kind}
        onClick={() => {
          onOpen(day.date);
        }}
        className={cn(
          'peer flex w-full cursor-pointer flex-col gap-1 rounded-lg p-1 text-left transition-colors',
          'hover:bg-surface-2 focus-visible:bg-surface-2',
          open && 'bg-surface-2 shadow-[inset_0_0_0_1px_var(--gold)]',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('font-mono text-[9px] leading-none', open ? 'text-gold' : 'text-text-3')}
        >
          {day.day}
        </span>
        {day.kind === 'trading' ? (
          <Ingot day={day} />
        ) : (
          <span
            aria-hidden="true"
            className="block h-7 rounded-[3px] border border-dashed border-line sm:h-9"
          />
        )}
      </button>
      <Tooltip day={day} currency={currency} />
    </div>
  );
}

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">{label}</dt>
      <dd className="font-mono text-xs text-text">{children}</dd>
    </div>
  );
}

function Summary({ summary, currency }: { summary: MonthSummary; currency: string }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3 md:w-48 md:shrink-0 md:grid-cols-1 md:content-start md:self-start md:border-l md:border-t-0 md:pl-6 md:pt-10">
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
      <SummaryItem label="Avg day Karat">
        <span className="text-gold">
          {summary.averageKarat === null ? '—' : formatKarat(summary.averageKarat)}
        </span>
      </SummaryItem>
    </dl>
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
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-5 md:flex-row md:gap-0">
      <div className="min-w-0 flex-1 md:max-w-[560px] md:pr-6">
        <h2 id={titleId} className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] tracking-[2px] text-gold">{month.key.slice(5)}</span>
          <span className="font-serif text-2xl text-text">{month.label}</span>
        </h2>

        <div aria-hidden="true" className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS_MONDAY_FIRST.map((name) => (
            <span
              key={name}
              className="px-1 text-[9px] font-medium uppercase tracking-[1.5px] text-text-3 sm:text-[10px]"
            >
              <span className="sm:hidden">{name.slice(0, 1)}</span>
              <span className="hidden sm:inline">{name.slice(0, 3)}</span>
            </span>
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-2.5">
          {month.weeks.map((week, weekIndex) => (
            <div key={`${month.key}-${weekIndex}`}>
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {week.map((day, column) =>
                  day === null ? (
                    <span key={column} aria-hidden="true" />
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
              {/* The ledge the week's ingots stand on. */}
              <span aria-hidden="true" className="vault-shelf mt-1 block h-px" />
            </div>
          ))}
        </div>
      </div>

      <Summary summary={month.summary} currency={currency} />
    </section>
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

  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reveal = useRef(false);
  const [announcement, setAnnouncement] = useState('');

  const open = useCallback(
    (date: string) => {
      setCursor(date);
      reveal.current = true;
      replaceSearch(`day=${date}`);
      const replay = view.replays[date];
      setAnnouncement(
        replay === undefined
          ? `Replay for ${longDate(date)}: no trades.`
          : `Replay for ${longDate(date)}: ${plural(replay.tradeCount, 'trade')}, day Karat ${formatKarat(
              replay.karat,
            )}, ${plural(replay.spans.length, 'tilt episode')}.`,
      );
    },
    [replaceSearch, view.replays],
  );

  const close = useCallback(() => {
    const date = openDate;
    replaceSearch('');
    setAnnouncement('Replay closed.');
    if (date !== null) {
      setCursor(date);
      buttons.current.get(date)?.focus();
    }
  }, [openDate, replaceSearch]);

  // A replay opened below the fold (a phone, a narrow window) is brought into
  // view and takes focus; one already on screen beside the calendar leaves
  // focus on the day, so the arrows can keep walking the week.
  useEffect(() => {
    if (!reveal.current || openDate === null) return;
    reveal.current = false;
    const panel = panelRef.current;
    if (panel === null) return;
    const box = panel.getBoundingClientRect();
    if (box.top >= 0 && box.top < window.innerHeight * 0.6) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, [openDate]);

  // Esc closes the replay from anywhere on the page.
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
  };

  const openDay = openDate === null ? null : (byDate.get(openDate) ?? null);

  return (
    <div className="grid grid-cols-1 gap-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)] xl:gap-12">
      <div
        role="group"
        aria-label="Days of the history"
        aria-describedby="vault-keys"
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-col gap-12"
      >
        <p id="vault-keys" className="sr-only">
          Arrow keys move between days, a week up or down and a day either side. Home and End go to
          the first and last day. Enter opens the day&rsquo;s replay; Escape closes it.
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

      <div
        id="vault-replay-panel"
        ref={panelRef}
        className="scroll-mt-32 lg:scroll-mt-24 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto"
      >
        {openDate === null ? (
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-1 p-5 sm:p-6">
            <span className="text-[11px] font-medium uppercase tracking-[3px] text-text-3">
              Discipline Replay
            </span>
            <p className="font-serif text-xl leading-snug text-text-2">
              Choose a day to replay it, trade by trade.
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
          <Replay
            key={openDate}
            date={openDate}
            day={view.replays[openDate] ?? null}
            vaultDay={openDay}
            currency={view.currency}
            reasons={view.reasons}
            onClose={close}
            headingRef={headingRef}
          />
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
