'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { Card, Label } from '@/components/ui';
import { Hallmark } from '@/components/viz/Hallmark';
import { formatDuration, formatLots, formatMoney, formatPct, formatR } from '@/lib/format';
import {
  IMPURITY_KINDS,
  IMPURITY_LABELS,
  NO_SESSION_LABEL,
  SESSION_KEYS,
  SESSION_LABELS,
  sessionsLabel,
} from '@/lib/ledger/labels';
import { ledgerCsv, ledgerCsvFilename } from '@/lib/ledger/csv';
import type { KeyTarget } from '@/lib/ledger/keyboard';
import { LEDGER_SHORTCUTS, ledgerKeyAction } from '@/lib/ledger/keyboard';
import type { LedgerQuery, LedgerSortKey } from '@/lib/ledger/query';
import {
  DEFAULT_LEDGER_QUERY,
  LEDGER_PAGE_SIZE,
  LEDGER_PERIODS,
  PERIOD_LABELS,
  applyLedgerQuery,
  clampPage,
  cleanSearch,
  dossierHref,
  matchesSearch,
  pageCount,
  pageOfIndex,
  pageRows,
  parseLedgerQuery,
  serializeLedgerQuery,
  toggleSort,
  withFilter,
} from '@/lib/ledger/query';
import type { PackedLedgerRows } from '@/lib/ledger/pack';
import { unpackLedgerRows } from '@/lib/ledger/pack';
import { summarizeRows } from '@/lib/ledger/summary';
import { rowHallmark } from '@/lib/ledger/types';
import { useLocationSearch } from './useLocationSearch';
import { useRoutes } from '@/components/app/SurfaceContext';

/**
 * The Ledger (CLAUDE.md §4, §17 Stage 4) — every closed trade, newest first.
 *
 * Quiet and fast (§2): hairline rows, mono figures, no motion. The whole view
 * — period, source, session, impurity, result, ticket search, sort and page —
 * lives in the URL, so any view can be linked, and the summary strip, the CSV
 * export and the Dossier's previous/next all read the same filtered rows.
 *
 * Fifty rows a page. 834 trades is nothing to filter, but it is a lot of DOM
 * to lay out on a phone; a page keeps the table at a fixed, small size.
 */

export interface LedgerSourceOption {
  value: string;
  label: string;
}

export interface LedgerScreenProps {
  /** Every row, packed as columns for the trip (see `lib/ledger/pack.ts`). */
  packed: PackedLedgerRows;
  asOfMs: number;
  currency: string;
  riskLimitPercent: number;
  sources: LedgerSourceOption[];
  hasOffSession: boolean;
}

function rowLinkId(id: string): string {
  return `ledger-row-${id}`;
}

function keyTargetOf(element: Element | null, search: HTMLInputElement | null): KeyTarget {
  if (element === null) return 'other';
  if (element === search) return 'search';
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  ) {
    return 'field';
  }
  if (element.closest('a, button, summary, [role="button"]') !== null) return 'control';
  return 'other';
}

const toneClass = (value: number): string =>
  value > 0 ? 'text-jade' : value < 0 ? 'text-oxblood-text' : 'text-text-2';

/* -------------------------------------------------------------------------
 * Small parts
 * ---------------------------------------------------------------------- */

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id}>
        <Label>{label}</Label>
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none sm:min-w-[9.5rem] rounded-full border border-line bg-surface-1 pl-4 pr-9 text-sm text-text-2 transition-colors hover:border-gold/30 hover:text-text"
        >
          {children}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-text-3">
          ▾
        </span>
      </div>
    </div>
  );
}

const COLUMNS: Array<{ key: LedgerSortKey | null; label: string; numeric: boolean; className?: string }> = [
  { key: null, label: 'Hallmark', numeric: false, className: 'w-[64px]' },
  { key: 'time', label: 'Time (UTC)', numeric: false },
  { key: null, label: 'Dir', numeric: false },
  { key: 'volume', label: 'Volume', numeric: true },
  { key: 'risk', label: 'Risk %', numeric: true },
  { key: 'r', label: 'R', numeric: true },
  { key: 'pnl', label: 'P&L', numeric: true },
  { key: null, label: 'Session', numeric: false },
  { key: 'duration', label: 'Duration', numeric: true },
  { key: null, label: 'Impurities', numeric: false },
];

const SORT_NAMES: Record<LedgerSortKey, string> = {
  time: 'time',
  volume: 'volume',
  risk: 'risk %',
  r: 'R',
  pnl: 'P&L',
  duration: 'duration',
};

/* -------------------------------------------------------------------------
 * The screen
 * ---------------------------------------------------------------------- */

export function LedgerScreen({
  packed,
  asOfMs,
  currency,
  riskLimitPercent,
  sources,
  hasOffSession,
}: LedgerScreenProps) {
  const router = useRouter();
  const routes = useRoutes();
  const rows = useMemo(() => unpackLedgerRows(packed), [packed]);
  const [search, replaceSearch] = useLocationSearch();
  const query = useMemo(() => parseLedgerQuery(search), [search]);

  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const focusPending = useRef(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const context = useMemo(() => ({ asOfMs }), [asOfMs]);
  const filtered = useMemo(() => applyLedgerQuery(rows, query, context), [rows, query, context]);
  const summary = useMemo(() => summarizeRows(filtered), [filtered]);
  const page = clampPage(query.page, filtered.length);
  const pages = pageCount(filtered.length);
  const visible = pageRows(filtered, page);
  const firstShown = filtered.length === 0 ? 0 : (page - 1) * LEDGER_PAGE_SIZE + 1;
  const lastShown = (page - 1) * LEDGER_PAGE_SIZE + visible.length;

  const selectedIndex = useMemo(() => {
    if (selectedId === null) return null;
    const index = filtered.findIndex((row) => row.id === selectedId);
    return index === -1 ? null : index;
  }, [filtered, selectedId]);

  /** Trades the search matches that the other filters are hiding. */
  const hiddenMatches = useMemo(() => {
    if (query.q === '' || filtered.length > 0) return 0;
    return rows.filter((row) => matchesSearch(row, query.q)).length;
  }, [rows, query.q, filtered.length]);

  const singleMatch = query.q !== '' && filtered.length === 1 ? (filtered[0] ?? null) : null;

  const update = useCallback(
    (next: LedgerQuery) => {
      replaceSearch(serializeLedgerQuery(next));
    },
    [replaceSearch],
  );

  // The strip and the table change together; say so once, politely.
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (lastCount.current !== null && lastCount.current !== filtered.length) {
      setAnnouncement(
        `${filtered.length} ${filtered.length === 1 ? 'trade' : 'trades'} in the current filter`,
      );
    }
    lastCount.current = filtered.length;
  }, [filtered.length]);

  const select = useCallback(
    (index: number) => {
      const row = filtered[index];
      if (row === undefined) return;
      setSelectedId(row.id);
      focusPending.current = true;
      const target = pageOfIndex(index);
      if (target !== page) update({ ...query, page: target });
      setAnnouncement(`Row ${index + 1} of ${filtered.length} selected`);
    },
    [filtered, page, query, update],
  );

  // Move focus to the selected row once it is on screen.
  useEffect(() => {
    if (!focusPending.current || selectedId === null) return;
    const link = document.getElementById(rowLinkId(selectedId));
    if (link === null) return;
    focusPending.current = false;
    link.focus({ preventScroll: true });
    link.closest('tr')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, page]);

  const focusTable = useCallback(() => {
    if (selectedIndex !== null && pageOfIndex(selectedIndex) === page) {
      document.getElementById(rowLinkId(filtered[selectedIndex]?.id ?? ''))?.focus();
      return;
    }
    const first = visible[0];
    if (first === undefined) {
      tableRef.current?.focus();
      return;
    }
    select((page - 1) * LEDGER_PAGE_SIZE);
  }, [filtered, page, select, selectedIndex, visible]);

  const openHelp = useCallback(() => {
    dialogRef.current?.showModal();
    setDialogOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = ledgerKeyAction(event, {
        target: keyTargetOf(document.activeElement, searchRef.current),
        selectedIndex,
        total: filtered.length,
        search: query.q,
        singleMatchId: singleMatch?.id ?? null,
        dialogOpen,
      });
      if (action === null) return;
      event.preventDefault();
      switch (action.type) {
        case 'select':
          select(action.index);
          break;
        case 'open': {
          const row = filtered[action.index];
          if (row !== undefined) router.push(dossierHref(row.id, query, routes));
          break;
        }
        case 'open-match':
          router.push(dossierHref(action.id, query, routes));
          break;
        case 'focus-search':
          searchRef.current?.focus();
          searchRef.current?.select();
          break;
        case 'clear-search':
          update(withFilter(query, 'q', ''));
          break;
        case 'focus-table':
          focusTable();
          break;
        case 'help':
          openHelp();
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen, filtered, focusTable, openHelp, query, router, routes, select, selectedIndex, singleMatch, update]);

  const exportCsv = useCallback(() => {
    const blob = new Blob([ledgerCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = ledgerCsvFilename(query.period, Date.now());
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [filtered, query.period]);

  const goToPage = (next: number) => {
    update({ ...query, page: next });
    setSelectedId(null);
    tableRef.current?.scrollIntoView({ block: 'start' });
  };

  const isFiltered =
    serializeLedgerQuery({ ...query, sort: DEFAULT_LEDGER_QUERY.sort, dir: DEFAULT_LEDGER_QUERY.dir }, { withoutPage: true }) !== '';

  return (
    <div className="flex flex-col gap-8">
      {/* — Filters — */}
      <div className="grid grid-cols-2 items-end gap-x-3 gap-y-5 sm:flex sm:flex-wrap sm:gap-x-4" role="search" aria-label="Filter the Ledger">
        <div className="flex flex-col gap-2">
          <Label id="ledger-period-label">Period</Label>
          <div role="group" aria-labelledby="ledger-period-label" className="flex h-10 items-center rounded-full border border-line bg-surface-1 p-1">
            {LEDGER_PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={query.period === period}
                onClick={() => update(withFilter(query, 'period', period))}
                className={cn(
                  'h-full flex-1 rounded-full px-4 text-xs font-medium transition-colors sm:flex-none',
                  query.period === period ? 'bg-surface-2 text-gold' : 'text-text-3 hover:text-text',
                )}
              >
                {PERIOD_LABELS[period]}
              </button>
            ))}
          </div>
        </div>

        <FilterSelect id="ledger-source" label="Source" value={query.source} onChange={(value) => update(withFilter(query, 'source', value))}>
          <option value="all">All sources</option>
          {sources.map((source) => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id="ledger-session"
          label="Session"
          value={query.session}
          onChange={(value) => update(withFilter(query, 'session', value as LedgerQuery['session']))}
        >
          <option value="all">All sessions</option>
          {SESSION_KEYS.map((key) => (
            <option key={key} value={key}>
              {SESSION_LABELS[key]}
            </option>
          ))}
          {hasOffSession || query.session === 'none' ? <option value="none">{NO_SESSION_LABEL}</option> : null}
        </FilterSelect>

        <FilterSelect
          id="ledger-impurity"
          label="Impurity"
          value={query.impurity}
          onChange={(value) => update(withFilter(query, 'impurity', value as LedgerQuery['impurity']))}
        >
          <option value="all">All trades</option>
          <option value="any">Any impurity</option>
          <option value="clean">Clean only</option>
          {IMPURITY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {IMPURITY_LABELS[kind]}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id="ledger-result"
          label="Result"
          value={query.result}
          onChange={(value) => update(withFilter(query, 'result', value as LedgerQuery['result']))}
        >
          <option value="all">Wins and losses</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
        </FilterSelect>

        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="ledger-search">
            <Label>Ticket</Label>
          </label>
          <div className="relative">
            <input
              ref={searchRef}
              id="ledger-search"
              type="search"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. 700766"
              value={query.q}
              onChange={(event) => update(withFilter(query, 'q', cleanSearch(event.target.value)))}
              aria-describedby="ledger-search-hint"
              className="h-10 w-full rounded-full sm:w-[13.5rem] border border-line bg-surface-1 pl-4 pr-9 font-mono text-sm text-text placeholder:font-sans placeholder:text-text-3 hover:border-gold/30 [&::-webkit-search-cancel-button]:hidden"
            />
            <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-text-3">
              /
            </kbd>
          </div>
        </div>

        <div className="col-span-2 flex items-end justify-end gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-xs font-medium text-text-2 transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export CSV
            <span className="font-mono text-[11px] text-text-3">{filtered.length}</span>
          </button>
          <button
            type="button"
            onClick={openHelp}
            aria-label="Keyboard shortcuts"
            aria-haspopup="dialog"
            className="inline-flex size-10 items-center justify-center rounded-full border border-line font-mono text-sm text-text-2 transition-colors hover:border-gold/40 hover:text-gold"
          >
            ?
          </button>
        </div>
      </div>

      {/* The search's own line: matches, the one-match shortcut, or where a match is hiding. */}
      <p id="ledger-search-hint" className="-mt-4 min-h-4 font-mono text-[11px] text-text-3">
        {query.q === '' ? (
          <span className="font-sans">Exact or partial · press / to search, Esc to clear</span>
        ) : singleMatch !== null ? (
          <>
            1 match ·{' '}
            <Link prefetch={false} href={dossierHref(singleMatch.id, query, routes)} className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
              Enter opens {singleMatch.id}
            </Link>
          </>
        ) : filtered.length > 0 ? (
          `${filtered.length} matches`
        ) : hiddenMatches > 0 ? (
          <>
            No match in the current filter · {hiddenMatches} outside it ·{' '}
            <button
              type="button"
              className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
              onClick={() => update({ ...DEFAULT_LEDGER_QUERY, q: query.q })}
            >
              Clear the other filters
            </button>
          </>
        ) : (
          'No trade matches that ticket'
        )}
      </p>

      {/* — Summary strip — */}
      <Card className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-10" aria-labelledby="ledger-summary-label">
        <div className="flex shrink-0 flex-col gap-1.5">
          <Label id="ledger-summary-label" className="text-gold">Current filter</Label>
          <span className="font-mono text-[11px] text-text-3">
            {PERIOD_LABELS[query.period]}
            {isFiltered ? ' · filtered' : ' · all trades'}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-1 sm:flex-wrap sm:justify-between">
          {[
            { label: 'Trades', value: String(summary.trades), tone: 'text-text' },
            {
              label: 'Win rate',
              value: summary.winRate === null ? '—' : formatPct(summary.winRate),
              tone: 'text-text',
            },
            { label: 'Net R', value: formatR(summary.netR), tone: toneClass(summary.netR) },
            {
              label: 'Net P&L',
              value: formatMoney(summary.netMoney, { currency, signed: true }),
              tone: toneClass(summary.netMoney),
            },
            {
              label: 'Average risk',
              value: summary.averageRiskPercent === null ? '—' : formatPct(summary.averageRiskPercent, { digits: 2 }),
              tone: 'text-text',
            },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-2">
              <dt className="text-[11px] font-medium uppercase tracking-[2px] text-text-3">{stat.label}</dt>
              <dd className={cn('font-mono text-xl tabular-nums leading-none', stat.tone)}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* — The table — skipped by the renderer until it nears the screen. */}
      <Card flush className="ledger-table overflow-hidden">
        <div ref={tableRef} tabIndex={-1} className="w-full overflow-x-auto scroll-mt-24 focus:outline-none">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <caption className="sr-only">
              Closed trades in the current filter, {filtered.length} in all, sorted by {SORT_NAMES[query.sort]}{' '}
              {query.dir === 'desc' ? 'descending' : 'ascending'}. Showing rows {firstShown} to {lastShown}.
            </caption>
            <thead className="border-b border-line">
              <tr>
                {COLUMNS.map((column) => {
                  const active = column.key !== null && query.sort === column.key;
                  return (
                    <th
                      key={column.label}
                      scope="col"
                      aria-sort={active ? (query.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                      className={cn(
                        'px-4 py-3 text-[11px] font-medium uppercase tracking-[2px] text-text-3 whitespace-nowrap',
                        column.numeric ? 'text-right' : 'text-left',
                        column.className,
                      )}
                    >
                      {column.key === null ? (
                        column.label
                      ) : (
                        <button
                          type="button"
                          onClick={() => update(toggleSort(query, column.key as LedgerSortKey))}
                          className={cn(
                            'inline-flex items-center gap-1.5 uppercase tracking-[2px] transition-colors hover:text-text',
                            active ? 'text-gold' : '',
                          )}
                        >
                          {column.label}
                          <span aria-hidden="true" className={cn('font-mono text-[10px]', active ? 'opacity-100' : 'opacity-30')}>
                            {active && query.dir === 'asc' ? '↑' : '↓'}
                          </span>
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-sm text-text-3">
                    No trades in the current filter.
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const selected = row.id === selectedId;
                  const href = dossierHref(row.id, query, routes);
                  return (
                    <tr
                      key={row.id}
                      data-selected={selected ? '' : undefined}
                      aria-current={selected ? 'true' : undefined}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest('a') !== null) return;
                        router.push(href);
                      }}
                      className="ledger-row cursor-pointer border-b border-line last:border-b-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-2.5">
                        <Hallmark input={rowHallmark(row, riskLimitPercent)} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Link
                          id={rowLinkId(row.id)}
                          href={href}
                          prefetch={false}
                          onFocus={() => setSelectedId(row.id)}
                          aria-label={`${row.id}, ${row.openTime.slice(0, 10)} ${row.openTime.slice(11, 16)} UTC, ${row.source}, ${row.direction}, ${formatR(row.rMultiple)}, ${formatMoney(row.netProfit, { currency, signed: true })}. Open the Dossier`}
                          className="block font-mono text-[13px] text-text focus-visible:outline-none"
                        >
                          {row.openTime.slice(0, 10)} <span className="text-text-2">{row.openTime.slice(11, 16)}</span>
                        </Link>
                        <span className="mt-1 block text-[11px] text-text-3">{row.source}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[2px] text-text-2">
                        {row.direction}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-2">{formatLots(row.volume)}</td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right font-mono tabular-nums',
                          row.riskPercent > riskLimitPercent ? 'text-gold-light' : 'text-text-2',
                        )}
                      >
                        {formatPct(row.riskPercent, { digits: 2 })}
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-mono tabular-nums', toneClass(row.rMultiple))}>
                        {formatR(row.rMultiple, { digits: 2 })}
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-mono tabular-nums', toneClass(row.netProfit))}>
                        {formatMoney(row.netProfit, { currency, signed: true })}
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-text-2">{sessionsLabel(row.sessions)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-2">
                        {formatDuration(row.durationSeconds)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-3">
                        {row.impurities.length === 0 ? (
                          <span className="text-text-3/60">—</span>
                        ) : (
                          row.impurities.map((kind) => IMPURITY_LABELS[kind]).join(' · ')
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="font-mono text-[11px] text-text-3">
            {filtered.length === 0
              ? '0 rows'
              : `Rows ${firstShown}–${lastShown} of ${filtered.length} · page ${page} of ${pages}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="h-9 rounded-full border border-line px-4 text-xs text-text-2 transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous page
            </button>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= pages}
              className="h-9 rounded-full border border-line px-4 text-xs text-text-2 transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next page
            </button>
          </div>
        </div>
      </Card>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* — Shortcuts — a native modal: it traps focus and closes on Esc by itself. */}
      <dialog
        ref={dialogRef}
        aria-labelledby="ledger-shortcuts-title"
        onClose={() => setDialogOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,420px)] rounded-card border border-line bg-surface-1 p-0 text-text backdrop:bg-bg/80"
      >
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-center justify-between">
            <h2 id="ledger-shortcuts-title" className="font-serif text-2xl font-normal">
              Keyboard
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full border border-line px-3 py-1.5 text-[11px] uppercase tracking-[2px] text-text-3 hover:text-text"
            >
              Close
            </button>
          </div>
          <dl className="flex flex-col">
            {LEDGER_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.does} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
                <dt className="flex shrink-0 gap-1.5">
                  {shortcut.keys.map((key) => (
                    <kbd key={key} className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[11px] text-gold">
                      {key}
                    </kbd>
                  ))}
                </dt>
                <dd className="text-right text-xs text-text-2">{shortcut.does}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[11px] leading-relaxed text-text-3">
            Shortcuts never fire while you type in a field. Filters, search and sort live in the address bar, so a view can be linked.
          </p>
        </div>
      </dialog>
    </div>
  );
}
