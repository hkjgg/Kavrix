/**
 * Ledger rows — what one closed trade looks like in the table (Stage 4).
 *
 * Built on the server from the engine's `EnrichedTrade`, and nothing else is
 * derived here: every figure a row carries is a field the engine already
 * measured. The row is the one shape the table, its filters, the summary
 * strip, the CSV export and the Dossier's previous/next all read, so they can
 * never disagree about a trade.
 *
 * The browser receives rows, never `EnrichedTrade`: a row is a fraction of
 * the size and holds nothing the Ledger does not draw or export. The Hallmark
 * is not stored on the row — `rowHallmark` reads its six dimensions off it.
 *
 * Server only: this module reads the engine. The row's shape lives in
 * `types.ts`, which the browser may import.
 */

import type { HallmarkInput, HallmarkStop } from '@/components/viz/hallmark';
import { newsBucket } from '@/lib/engine/edgemap';
import type { EnrichedTrade } from '@/lib/engine/enrich';
import type { EngineSettings } from '@/lib/engine/settings';
import type { LedgerRow } from './types';

export type { LedgerRow } from './types';

export function stopStateOf(trade: EnrichedTrade): HallmarkStop {
  if (trade.noStop) return 'none';
  if (trade.slWidened) return 'widened';
  return 'compliant';
}

/** The Hallmark's six dimensions, straight off the engine's trade. */
export function hallmarkInputOf(trade: EnrichedTrade, settings: EngineSettings): HallmarkInput {
  return {
    rMultiple: trade.rMultiple,
    riskPercent: trade.riskPercent,
    riskLimitPercent: settings.riskLimitPercent,
    durationSeconds: trade.durationSeconds,
    sessions: trade.sessions,
    news: newsBucket(trade, settings),
    newsMinutes: trade.newsProximityMinutes,
    stop: stopStateOf(trade),
  };
}

export interface BuildRowsOptions {
  settings: EngineSettings;
  /** EA names by magic number. */
  eaNames: ReadonlyMap<number, string>;
  /** Deal tickets by trade id, when the source has them. */
  tickets?: ReadonlyMap<string, { entry: number; exit: number }>;
}

export function sourceLabel(magic: number, eaNames: ReadonlyMap<number, string>): string {
  if (magic === 0) return 'Manual';
  return eaNames.get(magic) ?? `EA ${magic}`;
}

export function toLedgerRow(trade: EnrichedTrade, options: BuildRowsOptions): LedgerRow {
  const tickets = options.tickets?.get(trade.id);
  return {
    id: trade.id,
    positionId: trade.positionId,
    entryTicket: tickets?.entry ?? null,
    exitTicket: tickets?.exit ?? null,
    magic: trade.magic,
    source: sourceLabel(trade.magic, options.eaNames),
    symbol: trade.symbol,
    direction: trade.direction,
    volume: trade.volume,
    openTime: trade.openTime,
    closeTime: trade.closeTime,
    openTimeMs: trade.openTimeMs,
    riskPercent: trade.riskPercent,
    rMultiple: trade.rMultiple,
    netProfit: trade.netProfit,
    commission: trade.commission,
    swap: trade.swap,
    sessions: trade.sessions.slice(),
    durationSeconds: trade.durationSeconds,
    impurities: trade.impurities.slice(),
    isWin: trade.isWin,
    isLoss: trade.isLoss,
    news: newsBucket(trade, options.settings),
    newsMinutes: trade.newsProximityMinutes,
    stop: stopStateOf(trade),
  };
}

/** Every trade, in the engine's order. The query decides what is shown and how. */
export function buildLedgerRows(
  trades: readonly EnrichedTrade[],
  options: BuildRowsOptions,
): LedgerRow[] {
  return trades.map((trade) => toLedgerRow(trade, options));
}

