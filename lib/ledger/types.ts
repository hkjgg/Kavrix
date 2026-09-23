/**
 * The Ledger row's shape, and the one thing the browser derives from it.
 *
 * Types-only imports, so every client component may use this module without
 * pulling the engine into the bundle. The rows themselves are built on the
 * server, in `rows.ts`.
 */

import type { HallmarkInput, HallmarkNews, HallmarkStop } from '@/components/viz/hallmark';
import type { ImpurityKind, SessionKey } from '@/lib/engine/enrich';

export interface LedgerRow {
  id: string;
  positionId: number;
  /** Deal tickets, when the source supplied them — what a trader searches by. */
  entryTicket: number | null;
  exitTicket: number | null;
  /** `0` for a manual trade, else the EA's magic number. */
  magic: number;
  /** `Manual`, or the EA's name. */
  source: string;
  symbol: string;
  direction: 'buy' | 'sell';
  volume: number;
  openTime: string;
  closeTime: string;
  openTimeMs: number;
  riskPercent: number;
  rMultiple: number;
  netProfit: number;
  commission: number;
  swap: number;
  sessions: SessionKey[];
  durationSeconds: number;
  impurities: ImpurityKind[];
  isWin: boolean;
  isLoss: boolean;
  /** §6.8 news bucket and the minutes behind it — two of the Hallmark's six dimensions. */
  news: HallmarkNews;
  newsMinutes: number | null;
  stop: HallmarkStop;
}

/** The Hallmark's six dimensions, read off a row — safe in the browser. */
export function rowHallmark(row: LedgerRow, riskLimitPercent: number): HallmarkInput {
  return {
    rMultiple: row.rMultiple,
    riskPercent: row.riskPercent,
    riskLimitPercent,
    durationSeconds: row.durationSeconds,
    sessions: row.sessions,
    news: row.news,
    newsMinutes: row.newsMinutes,
    stop: row.stop,
  };
}
