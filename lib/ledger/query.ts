/**
 * The Ledger's view state — filters, search, sort and page — and the one
 * function that applies it (Stage 4).
 *
 * The state lives in the URL, so a view can be linked: `serializeLedgerQuery`
 * writes only what differs from the default, `parseLedgerQuery` reads it back
 * and ignores anything it does not recognise. The Ledger, the CSV export and
 * the Dossier's previous/next all go through `applyLedgerQuery`, so "the
 * current filter" means the same rows everywhere.
 *
 * Pure and browser-safe. Nothing here is a metric: it selects and orders rows
 * the engine already measured.
 */

import type { ImpurityKind, SessionKey } from '@/lib/engine/enrich';
import { IMPURITY_KINDS, SESSION_KEYS } from './labels';
import type { LedgerRow } from './types';

/* -------------------------------------------------------------------------
 * Shape
 * ---------------------------------------------------------------------- */

export type LedgerPeriod = '30d' | '90d';
export const LEDGER_PERIODS: readonly LedgerPeriod[] = ['30d', '90d'];
export const PERIOD_DAYS: Record<LedgerPeriod, number> = { '30d': 30, '90d': 90 };
export const PERIOD_LABELS: Record<LedgerPeriod, string> = {
  '30d': '30-day',
  '90d': '90-day',
};

/** `all`, `manual`, or an EA's magic number as a string. */
export type SourceFilter = string;

export type SessionFilter = 'all' | SessionKey | 'none';
export type ImpurityFilter = 'all' | 'any' | 'clean' | ImpurityKind;
export type ResultFilter = 'all' | 'win' | 'loss';

/** Every numeric column sorts. */
export type LedgerSortKey = 'time' | 'volume' | 'risk' | 'r' | 'pnl' | 'duration';
export const LEDGER_SORT_KEYS: readonly LedgerSortKey[] = [
  'time',
  'volume',
  'risk',
  'r',
  'pnl',
  'duration',
];
export type SortDirection = 'asc' | 'desc';

export interface LedgerQuery {
  period: LedgerPeriod;
  source: SourceFilter;
  session: SessionFilter;
  impurity: ImpurityFilter;
  result: ResultFilter;
  /** Ticket or position id, exact or partial. */
  q: string;
  sort: LedgerSortKey;
  dir: SortDirection;
  /** 1-based. */
  page: number;
}

/** Newest first, everything in the 90 days, page one. */
export const DEFAULT_LEDGER_QUERY: LedgerQuery = {
  period: '90d',
  source: 'all',
  session: 'all',
  impurity: 'all',
  result: 'all',
  q: '',
  sort: 'time',
  dir: 'desc',
  page: 1,
};

export const LEDGER_PAGE_SIZE = 50;

/** A search longer than any ticket is not a search. */
const MAX_SEARCH_LENGTH = 32;

/* -------------------------------------------------------------------------
 * URL round trip
 * ---------------------------------------------------------------------- */

export type QueryInput =
  | URLSearchParams
  | string
  | Record<string, string | string[] | undefined>;

function toSearchParams(input: QueryInput): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === 'string') return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }
  return params;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Keeps what a ticket search can use: letters, digits and the id's hyphen. */
export function cleanSearch(raw: string): string {
  return raw.replace(/[^0-9A-Za-z-]/g, '').slice(0, MAX_SEARCH_LENGTH);
}

/**
 * Reads a query from the URL. Unknown keys are ignored and unknown values
 * fall back to the default, so a stale or hand-edited link still opens.
 */
export function parseLedgerQuery(input: QueryInput): LedgerQuery {
  const params = toSearchParams(input);
  const source = params.get('source');
  const page = Number.parseInt(params.get('page') ?? '', 10);

  return {
    period: oneOf(params.get('period'), LEDGER_PERIODS, DEFAULT_LEDGER_QUERY.period),
    source:
      source === 'manual' || (source !== null && /^\d{1,10}$/.test(source) && source !== '0')
        ? source
        : 'all',
    session: oneOf<SessionFilter>(params.get('session'), ['all', ...SESSION_KEYS, 'none'], 'all'),
    impurity: oneOf<ImpurityFilter>(
      params.get('impurity'),
      ['all', 'any', 'clean', ...IMPURITY_KINDS],
      'all',
    ),
    result: oneOf<ResultFilter>(params.get('result'), ['all', 'win', 'loss'], 'all'),
    q: cleanSearch(params.get('q') ?? ''),
    sort: oneOf(params.get('sort'), LEDGER_SORT_KEYS, DEFAULT_LEDGER_QUERY.sort),
    dir: oneOf<SortDirection>(params.get('dir'), ['asc', 'desc'], DEFAULT_LEDGER_QUERY.dir),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

const KEY_ORDER: ReadonlyArray<keyof LedgerQuery> = [
  'period',
  'source',
  'session',
  'impurity',
  'result',
  'q',
  'sort',
  'dir',
  'page',
];

export interface SerializeOptions {
  /** Leave the page out — for links that carry the filter, not the position in it. */
  withoutPage?: boolean;
}

/**
 * The query as a URL search string, without the `?`. Only what differs from
 * the default is written, always in the same order, so one view has exactly
 * one URL.
 */
export function serializeLedgerQuery(query: LedgerQuery, options: SerializeOptions = {}): string {
  const params = new URLSearchParams();
  for (const key of KEY_ORDER) {
    if (key === 'page' && options.withoutPage === true) continue;
    const value = query[key];
    if (value === DEFAULT_LEDGER_QUERY[key]) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/** `/path` or `/path?…`. */
export function withQuery(path: string, search: string): string {
  return search === '' ? path : `${path}?${search}`;
}

/**
 * A trade's Dossier, carrying the Ledger's filter and sort (not its page), so
 * the Dossier's previous and next walk the same rows the reader came from.
 */
export function dossierHref(id: string, query: LedgerQuery): string {
  return withQuery(`/trade/${encodeURIComponent(id)}`, serializeLedgerQuery(query, { withoutPage: true }));
}

/* -------------------------------------------------------------------------
 * Search
 * ---------------------------------------------------------------------- */

/**
 * What a search is compared with: the digits a trader types. `T-700766`,
 * `#700766` and `700766` are the same search.
 */
export function normalizeSearch(raw: string): string {
  return raw.trim().toLowerCase().replace(/^(t-|#)/, '').replace(/[^0-9a-z]/g, '');
}

/**
 * True when the search is a substring of the position id, either deal ticket
 * or the trade id — so an exact ticket matches, and so does any part of one.
 */
export function matchesSearch(row: LedgerRow, raw: string): boolean {
  const needle = normalizeSearch(raw);
  if (needle === '') return true;
  const haystacks = [
    String(row.positionId),
    row.entryTicket === null ? '' : String(row.entryTicket),
    row.exitTicket === null ? '' : String(row.exitTicket),
    normalizeSearch(row.id),
  ];
  return haystacks.some((value) => value !== '' && value.includes(needle));
}

/* -------------------------------------------------------------------------
 * Filter and sort
 * ---------------------------------------------------------------------- */

export interface FilterContext {
  /** The engine's "now" — the end of every period. Never the clock. */
  asOfMs: number;
}

const DAY_MS = 86_400_000;

function matchesImpurity(row: LedgerRow, filter: ImpurityFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'any') return row.impurities.length > 0;
  if (filter === 'clean') return row.impurities.length === 0;
  return row.impurities.includes(filter);
}

function matchesSession(row: LedgerRow, filter: SessionFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return row.sessions.length === 0;
  return row.sessions.includes(filter);
}

/** Every filter except the search — used to tell a reader a match is hidden by one. */
export function filterRowsExceptSearch(
  rows: readonly LedgerRow[],
  query: LedgerQuery,
  context: FilterContext,
): LedgerRow[] {
  const from = context.asOfMs - PERIOD_DAYS[query.period] * DAY_MS;
  return rows.filter(
    (row) =>
      row.openTimeMs > from &&
      row.openTimeMs <= context.asOfMs &&
      (query.source === 'all' ||
        (query.source === 'manual' ? row.magic === 0 : String(row.magic) === query.source)) &&
      matchesSession(row, query.session) &&
      matchesImpurity(row, query.impurity) &&
      (query.result === 'all' || (query.result === 'win' ? row.isWin : row.isLoss)),
  );
}

export function filterRows(
  rows: readonly LedgerRow[],
  query: LedgerQuery,
  context: FilterContext,
): LedgerRow[] {
  return filterRowsExceptSearch(rows, query, context).filter((row) =>
    matchesSearch(row, query.q),
  );
}

const SORT_VALUE: Record<LedgerSortKey, (row: LedgerRow) => number> = {
  time: (row) => row.openTimeMs,
  volume: (row) => row.volume,
  risk: (row) => row.riskPercent,
  r: (row) => row.rMultiple,
  pnl: (row) => row.netProfit,
  duration: (row) => row.durationSeconds,
};

/**
 * Sorted by one column. Ties fall back to newest first, then to the id, so
 * the order is total and the same rows always come out in the same order.
 */
export function sortRows(
  rows: readonly LedgerRow[],
  sort: LedgerSortKey,
  dir: SortDirection,
): LedgerRow[] {
  const value = SORT_VALUE[sort];
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .slice()
    .sort(
      (a, b) =>
        sign * (value(a) - value(b)) ||
        b.openTimeMs - a.openTimeMs ||
        a.id.localeCompare(b.id),
    );
}

/** The rows the table shows, in the order it shows them — every page of them. */
export function applyLedgerQuery(
  rows: readonly LedgerRow[],
  query: LedgerQuery,
  context: FilterContext,
): LedgerRow[] {
  return sortRows(filterRows(rows, query, context), query.sort, query.dir);
}

/**
 * The next query after a header click: the same column flips direction, a
 * new column starts descending (largest first, newest first). Back to page one.
 */
export function toggleSort(query: LedgerQuery, key: LedgerSortKey): LedgerQuery {
  if (query.sort === key) {
    return { ...query, dir: query.dir === 'desc' ? 'asc' : 'desc', page: 1 };
  }
  return { ...query, sort: key, dir: 'desc', page: 1 };
}

/** A filter change: the new value, and back to page one. */
export function withFilter<K extends keyof LedgerQuery>(
  query: LedgerQuery,
  key: K,
  value: LedgerQuery[K],
): LedgerQuery {
  return { ...query, [key]: value, page: key === 'page' ? (value as number) : 1 };
}

/* -------------------------------------------------------------------------
 * Pages and neighbours
 * ---------------------------------------------------------------------- */

export function pageCount(total: number, size: number = LEDGER_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, total: number, size: number = LEDGER_PAGE_SIZE): number {
  return Math.min(Math.max(1, Math.floor(page)), pageCount(total, size));
}

/** The 1-based page a row index falls on. */
export function pageOfIndex(index: number, size: number = LEDGER_PAGE_SIZE): number {
  return Math.floor(Math.max(index, 0) / size) + 1;
}

export function pageRows<T>(rows: readonly T[], page: number, size: number = LEDGER_PAGE_SIZE): T[] {
  const start = (clampPage(page, rows.length, size) - 1) * size;
  return rows.slice(start, start + size);
}

export interface Adjacent<T> {
  /** Position in the ordered rows, `-1` when the id is not among them. */
  index: number;
  total: number;
  previous: T | null;
  next: T | null;
}

/** The rows either side of `id`, in the Ledger's order — the Dossier's previous and next. */
export function adjacentRows<T extends { id: string }>(ordered: readonly T[], id: string): Adjacent<T> {
  const index = ordered.findIndex((row) => row.id === id);
  if (index === -1) return { index, total: ordered.length, previous: null, next: null };
  return {
    index,
    total: ordered.length,
    previous: ordered[index - 1] ?? null,
    next: ordered[index + 1] ?? null,
  };
}
