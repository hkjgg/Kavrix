import { describe, expect, it } from 'vitest';
import { FIXTURE_AS_OF_MS, makeRow } from './fixtures';
import type { LedgerQuery } from './query';
import {
  DEFAULT_LEDGER_QUERY,
  LEDGER_PAGE_SIZE,
  adjacentRows,
  applyLedgerQuery,
  clampPage,
  dossierHref,
  filterRows,
  matchesSearch,
  normalizeSearch,
  pageCount,
  pageOfIndex,
  pageRows,
  parseLedgerQuery,
  serializeLedgerQuery,
  sortRows,
  toggleSort,
  withFilter,
} from './query';

const context = { asOfMs: FIXTURE_AS_OF_MS };
const q = (overrides: Partial<LedgerQuery>): LedgerQuery => ({ ...DEFAULT_LEDGER_QUERY, ...overrides });
const ids = (rows: ReadonlyArray<{ id: string }>): string[] => rows.map((row) => row.id);

describe('URL state', () => {
  it('reads an empty URL as the default view', () => {
    expect(parseLedgerQuery('')).toEqual(DEFAULT_LEDGER_QUERY);
    expect(serializeLedgerQuery(DEFAULT_LEDGER_QUERY)).toBe('');
  });

  it('round-trips every kind of view through the URL', () => {
    const views: LedgerQuery[] = [
      q({ period: '30d' }),
      q({ source: 'manual', session: 'london', impurity: 'news', result: 'loss' }),
      q({ source: '1003', impurity: 'any', sort: 'r', dir: 'asc', page: 3 }),
      q({ q: '7007', impurity: 'clean', session: 'none', sort: 'duration' }),
      q({ period: '30d', source: '1001', result: 'win', sort: 'pnl', dir: 'desc', page: 2 }),
    ];
    for (const view of views) {
      expect(parseLedgerQuery(serializeLedgerQuery(view))).toEqual(view);
      expect(parseLedgerQuery(`?${serializeLedgerQuery(view)}`)).toEqual(view);
    }
  });

  it('writes only what differs from the default, in a fixed order', () => {
    expect(serializeLedgerQuery(q({ sort: 'r', period: '30d', page: 2 }))).toBe('period=30d&sort=r&page=2');
    expect(serializeLedgerQuery(q({ sort: 'r', page: 2 }), { withoutPage: true })).toBe('sort=r');
  });

  it('falls back to the default for anything it does not recognise', () => {
    expect(
      parseLedgerQuery('period=7d&source=0&session=tokyo&impurity=luck&result=draw&sort=karat&dir=up&page=-4&extra=1'),
    ).toEqual(DEFAULT_LEDGER_QUERY);
    expect(parseLedgerQuery('source=abc').source).toBe('all');
    expect(parseLedgerQuery('page=2.9').page).toBe(2);
  });

  it('accepts Next’s searchParams object, first value of a repeated key', () => {
    expect(parseLedgerQuery({ period: '30d', source: ['manual', '1001'], q: undefined })).toEqual(
      q({ period: '30d', source: 'manual' }),
    );
  });

  it('strips a search down to what a ticket can contain', () => {
    expect(parseLedgerQuery('q=%23700%20766%3Cscript%3E').q).toBe('700766script');
  });

  it('links a Dossier with the filter and sort, never the page', () => {
    expect(dossierHref('T-700766', q({ source: 'manual', sort: 'r', page: 4 }))).toBe(
      '/demo/trade/T-700766?source=manual&sort=r',
    );
    expect(dossierHref('T-700766', DEFAULT_LEDGER_QUERY)).toBe('/demo/trade/T-700766');
  });
});

describe('filters', () => {
  const recent = makeRow({ daysAgo: 2, sessions: ['london', 'newYork'], impurities: ['news'], rMultiple: -1 });
  const older = makeRow({ daysAgo: 45, sessions: ['asia'], rMultiple: 2 });
  const ea = makeRow({ daysAgo: 5, magic: 1001, source: 'Gold Scalper', sessions: ['newYork'], rMultiple: 0.5 });
  const offSession = makeRow({ daysAgo: 10, sessions: [], impurities: ['revenge', 'oversized'], rMultiple: -2 });
  const future = makeRow({ daysAgo: -1 });
  const ancient = makeRow({ daysAgo: 91 });
  const rows = [recent, older, ea, offSession, future, ancient];

  it('keeps the period to trades opened inside it, ending at the engine’s now', () => {
    expect(ids(filterRows(rows, q({ period: '30d' }), context))).toEqual(ids([recent, ea, offSession]));
    expect(ids(filterRows(rows, q({ period: '90d' }), context))).toEqual(ids([recent, older, ea, offSession]));
  });

  it('filters by source: manual, or one EA by magic', () => {
    expect(ids(filterRows(rows, q({ source: 'manual' }), context))).toEqual(ids([recent, older, offSession]));
    expect(ids(filterRows(rows, q({ source: '1001' }), context))).toEqual(ids([ea]));
    expect(filterRows(rows, q({ source: '1002' }), context)).toEqual([]);
  });

  it('filters by session, overlaps included, and by no session at all', () => {
    expect(ids(filterRows(rows, q({ session: 'newYork' }), context))).toEqual(ids([recent, ea]));
    expect(ids(filterRows(rows, q({ session: 'none' }), context))).toEqual(ids([offSession]));
  });

  it('filters by impurity: one kind, any, or clean', () => {
    expect(ids(filterRows(rows, q({ impurity: 'oversized' }), context))).toEqual(ids([offSession]));
    expect(ids(filterRows(rows, q({ impurity: 'any' }), context))).toEqual(ids([recent, offSession]));
    expect(ids(filterRows(rows, q({ impurity: 'clean' }), context))).toEqual(ids([older, ea]));
  });

  it('filters by result', () => {
    expect(ids(filterRows(rows, q({ result: 'win' }), context))).toEqual(ids([older, ea]));
    expect(ids(filterRows(rows, q({ result: 'loss' }), context))).toEqual(ids([recent, offSession]));
  });

  it('combines every filter', () => {
    expect(
      ids(filterRows(rows, q({ period: '30d', source: 'manual', impurity: 'any', result: 'loss', session: 'london' }), context)),
    ).toEqual(ids([recent]));
  });
});

describe('ticket search', () => {
  const row = makeRow({ id: 'T-700766', positionId: 700766, entryTicket: 901532, exitTicket: 901533 });
  const other = makeRow({ id: 'T-700767', positionId: 700767, entryTicket: 901534, exitTicket: 901535 });

  it('treats T-, # and bare digits as the same search', () => {
    expect(normalizeSearch(' T-700766 ')).toBe('700766');
    expect(normalizeSearch('#700766')).toBe('700766');
  });

  it('matches exact and partial positions and deal tickets', () => {
    expect(matchesSearch(row, '700766')).toBe(true);
    expect(matchesSearch(row, '0766')).toBe(true);
    expect(matchesSearch(row, 'T-700766')).toBe(true);
    expect(matchesSearch(row, '901532')).toBe(true);
    expect(matchesSearch(row, '1533')).toBe(true);
    expect(matchesSearch(row, '123456')).toBe(false);
    expect(matchesSearch(row, '')).toBe(true);
  });

  it('narrows the table like any other filter', () => {
    expect(ids(filterRows([row, other], q({ q: '7007' }), context))).toEqual(ids([row, other]));
    expect(ids(filterRows([row, other], q({ q: '700767' }), context))).toEqual(ids([other]));
  });
});

describe('sorting', () => {
  const a = makeRow({ daysAgo: 3, volume: 0.5, riskPercent: 1.2, rMultiple: -1, durationSeconds: 600 });
  const b = makeRow({ daysAgo: 2, volume: 0.2, riskPercent: 0.8, rMultiple: 2, durationSeconds: 7_200 });
  const c = makeRow({ daysAgo: 1, volume: 0.5, riskPercent: 2.1, rMultiple: 0.5, durationSeconds: 60 });

  it('is newest first by default', () => {
    expect(ids(applyLedgerQuery([a, b, c], DEFAULT_LEDGER_QUERY, context))).toEqual(ids([c, b, a]));
  });

  it('sorts every numeric column both ways', () => {
    expect(ids(sortRows([a, b, c], 'r', 'desc'))).toEqual(ids([b, c, a]));
    expect(ids(sortRows([a, b, c], 'r', 'asc'))).toEqual(ids([a, c, b]));
    expect(ids(sortRows([a, b, c], 'pnl', 'asc'))).toEqual(ids([a, c, b]));
    expect(ids(sortRows([a, b, c], 'risk', 'desc'))).toEqual(ids([c, a, b]));
    expect(ids(sortRows([a, b, c], 'duration', 'asc'))).toEqual(ids([c, a, b]));
    expect(ids(sortRows([a, b, c], 'time', 'asc'))).toEqual(ids([a, b, c]));
  });

  it('breaks a tie newest first, so the order is total', () => {
    // a and c hold the same volume; c is newer.
    expect(ids(sortRows([a, b, c], 'volume', 'desc'))).toEqual(ids([c, a, b]));
    expect(ids(sortRows([a, b, c], 'volume', 'asc'))).toEqual(ids([b, c, a]));
  });

  it('flips the same column and starts a new one descending, back on page one', () => {
    const byR = toggleSort(q({ page: 3 }), 'r');
    expect(byR).toEqual(q({ sort: 'r', dir: 'desc', page: 1 }));
    expect(toggleSort(byR, 'r').dir).toBe('asc');
    expect(toggleSort(q({ sort: 'r', dir: 'asc' }), 'pnl')).toEqual(q({ sort: 'pnl', dir: 'desc' }));
  });

  it('sends a filter change back to page one', () => {
    expect(withFilter(q({ page: 4 }), 'result', 'win')).toEqual(q({ result: 'win', page: 1 }));
    expect(withFilter(q({ page: 4 }), 'page', 2).page).toBe(2);
  });
});

describe('pages and neighbours', () => {
  it(`pages ${LEDGER_PAGE_SIZE} rows at a time`, () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(220)).toBe(5);
    expect(clampPage(9, 220)).toBe(5);
    expect(clampPage(0, 220)).toBe(1);
    expect(pageOfIndex(0)).toBe(1);
    expect(pageOfIndex(49)).toBe(1);
    expect(pageOfIndex(50)).toBe(2);
    const numbers = Array.from({ length: 120 }, (_, index) => index);
    expect(pageRows(numbers, 3)).toEqual(numbers.slice(100, 120));
    expect(pageRows(numbers, 99)).toEqual(numbers.slice(100, 120));
  });

  it('finds the rows either side of a trade, in the Ledger’s order', () => {
    const ordered = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(adjacentRows(ordered, 'b')).toEqual({ index: 1, total: 3, previous: { id: 'a' }, next: { id: 'c' } });
    expect(adjacentRows(ordered, 'a').previous).toBeNull();
    expect(adjacentRows(ordered, 'c').next).toBeNull();
    expect(adjacentRows(ordered, 'z')).toEqual({ index: -1, total: 3, previous: null, next: null });
  });
});
