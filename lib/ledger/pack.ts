/**
 * Ledger rows, packed for the trip to the browser.
 *
 * The Ledger ships every row so it can filter, sort and export without a
 * round trip — 834 on the demo. As objects, each row repeats twenty key names
 * and the lot is escaped into the page's inline flight data, which made
 * `/ledger` two-thirds of a megabyte. Packed as columns, with the small enums
 * as indexes and the sets as bitmasks, it is a fraction of that, and a phone
 * parses it in a fraction of the time.
 *
 * Lossless: `unpackLedgerRows(packLedgerRows(rows))` deep-equals `rows`.
 * Browser-safe: types-only imports.
 */

import type { HallmarkNews, HallmarkStop } from '@/components/viz/hallmark';
import type { ImpurityKind, SessionKey } from '@/lib/engine/enrich';
import { IMPURITY_KINDS, SESSION_KEYS } from './labels';
import type { LedgerRow } from './types';

const NEWS: readonly HallmarkNews[] = ['in-window', 'near', 'clear'];
const STOPS: readonly HallmarkStop[] = ['compliant', 'widened', 'none'];

export interface PackedLedgerRows {
  count: number;
  /** Distinct source labels; `source` holds an index into this. */
  sources: string[];
  symbols: string[];
  id: string[];
  positionId: number[];
  /** `-1` when the source supplied no ticket. */
  entryTicket: number[];
  exitTicket: number[];
  magic: number[];
  source: number[];
  symbol: number[];
  /** `1` buy, `0` sell. */
  buy: number[];
  volume: number[];
  openTime: string[];
  /** Seconds from open to close. */
  closeAfter: number[];
  riskPercent: number[];
  rMultiple: number[];
  netProfit: number[];
  commission: number[];
  swap: number[];
  /** Bit i set ⇔ `SESSION_KEYS[i]`. */
  sessions: number[];
  durationSeconds: number[];
  /** Each row's impurities, in order, as indexes into `IMPURITY_KINDS`, packed base 8. */
  impurities: number[];
  /** `1` win, `-1` loss, `0` neither. */
  result: number[];
  news: number[];
  /** `-1` when there is no release on the calendar. */
  newsMinutes: number[];
  stop: number[];
}

function indexer(values: string[]): (value: string) => number {
  const index = new Map<string, number>();
  return (value) => {
    const existing = index.get(value);
    if (existing !== undefined) return existing;
    values.push(value);
    index.set(value, values.length - 1);
    return values.length - 1;
  };
}

/** Impurities keep their order (revenge first, as the engine flags it): base-8 digits, first most significant. */
function packImpurities(kinds: readonly ImpurityKind[]): number {
  return kinds.reduce((packed, kind) => packed * 8 + IMPURITY_KINDS.indexOf(kind) + 1, 0);
}

function unpackImpurities(packed: number): ImpurityKind[] {
  const kinds: ImpurityKind[] = [];
  let rest = packed;
  while (rest > 0) {
    const kind = IMPURITY_KINDS[(rest % 8) - 1];
    if (kind !== undefined) kinds.unshift(kind);
    rest = Math.floor(rest / 8);
  }
  return kinds;
}

export function packLedgerRows(rows: readonly LedgerRow[]): PackedLedgerRows {
  const packed: PackedLedgerRows = {
    count: rows.length,
    sources: [],
    symbols: [],
    id: [],
    positionId: [],
    entryTicket: [],
    exitTicket: [],
    magic: [],
    source: [],
    symbol: [],
    buy: [],
    volume: [],
    openTime: [],
    closeAfter: [],
    riskPercent: [],
    rMultiple: [],
    netProfit: [],
    commission: [],
    swap: [],
    sessions: [],
    durationSeconds: [],
    impurities: [],
    result: [],
    news: [],
    newsMinutes: [],
    stop: [],
  };
  const source = indexer(packed.sources);
  const symbol = indexer(packed.symbols);

  for (const row of rows) {
    packed.id.push(row.id);
    packed.positionId.push(row.positionId);
    packed.entryTicket.push(row.entryTicket ?? -1);
    packed.exitTicket.push(row.exitTicket ?? -1);
    packed.magic.push(row.magic);
    packed.source.push(source(row.source));
    packed.symbol.push(symbol(row.symbol));
    packed.buy.push(row.direction === 'buy' ? 1 : 0);
    packed.volume.push(row.volume);
    packed.openTime.push(row.openTime);
    packed.closeAfter.push((Date.parse(row.closeTime) - row.openTimeMs) / 1000);
    packed.riskPercent.push(row.riskPercent);
    packed.rMultiple.push(row.rMultiple);
    packed.netProfit.push(row.netProfit);
    packed.commission.push(row.commission);
    packed.swap.push(row.swap);
    packed.sessions.push(
      row.sessions.reduce((mask, key) => mask | (1 << SESSION_KEYS.indexOf(key)), 0),
    );
    packed.durationSeconds.push(row.durationSeconds);
    packed.impurities.push(packImpurities(row.impurities));
    packed.result.push(row.isWin ? 1 : row.isLoss ? -1 : 0);
    packed.news.push(NEWS.indexOf(row.news));
    packed.newsMinutes.push(row.newsMinutes ?? -1);
    packed.stop.push(STOPS.indexOf(row.stop));
  }
  return packed;
}

export function unpackLedgerRows(packed: PackedLedgerRows): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const at = <T>(values: readonly T[], index: number, fallback: T): T => values[index] ?? fallback;

  for (let i = 0; i < packed.count; i += 1) {
    const openTime = at(packed.openTime, i, '');
    const openTimeMs = Date.parse(openTime);
    const entryTicket = at(packed.entryTicket, i, -1);
    const exitTicket = at(packed.exitTicket, i, -1);
    const newsMinutes = at(packed.newsMinutes, i, -1);
    const mask = at(packed.sessions, i, 0);
    const result = at(packed.result, i, 0);
    rows.push({
      id: at(packed.id, i, ''),
      positionId: at(packed.positionId, i, 0),
      entryTicket: entryTicket === -1 ? null : entryTicket,
      exitTicket: exitTicket === -1 ? null : exitTicket,
      magic: at(packed.magic, i, 0),
      source: at(packed.sources, at(packed.source, i, 0), ''),
      symbol: at(packed.symbols, at(packed.symbol, i, 0), ''),
      direction: at(packed.buy, i, 1) === 1 ? 'buy' : 'sell',
      volume: at(packed.volume, i, 0),
      openTime,
      closeTime: new Date(openTimeMs + at(packed.closeAfter, i, 0) * 1000).toISOString(),
      openTimeMs,
      riskPercent: at(packed.riskPercent, i, 0),
      rMultiple: at(packed.rMultiple, i, 0),
      netProfit: at(packed.netProfit, i, 0),
      commission: at(packed.commission, i, 0),
      swap: at(packed.swap, i, 0),
      sessions: SESSION_KEYS.filter((_, bit) => (mask & (1 << bit)) !== 0) as SessionKey[],
      durationSeconds: at(packed.durationSeconds, i, 0),
      impurities: unpackImpurities(at(packed.impurities, i, 0)),
      isWin: result === 1,
      isLoss: result === -1,
      news: at(NEWS, at(packed.news, i, 2), 'clear'),
      newsMinutes: newsMinutes === -1 ? null : newsMinutes,
      stop: at(STOPS, at(packed.stop, i, 0), 'compliant'),
    });
  }
  return rows;
}
