/**
 * Database rows → the engine's vocabulary (`lib/engine/types.ts`).
 *
 * Pure and browser-safe, so every conversion is unit-tested. The one thing
 * computed here rather than stored is **equity at entry** (§6.1's risk %
 * denominator), because it is not a fact about one trade but about the whole
 * account's history — see `equityAtEntryByTrade`.
 */

import type { Database } from '@/lib/supabase/database.types';
import type {
  Account,
  Ea,
  EngineSettings,
  NewsEvent,
  NewsImportance,
  SlModification,
  SymbolInfo,
  Trade,
} from '@/lib/engine';

type Tables = Database['public']['Tables'];
export type AccountRow = Tables['accounts']['Row'];
export type TradeRow = Tables['trades']['Row'];
export type ModificationRow = Tables['sl_modifications']['Row'];
export type NewsRow = Tables['news_events']['Row'];
export type EaRow = Tables['eas']['Row'];
export type SettingsRow = Tables['settings']['Row'];
export type TokenRow = Tables['connector_tokens']['Row'];

/** Any timestamp Postgres or PostgREST prints, as ISO 8601 with a `Z`. */
export function isoUtc(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new RangeError(`not a timestamp: ${value}`);
  return new Date(ms).toISOString();
}

export function accountFromRow(row: AccountRow): Account {
  return {
    login: row.login,
    server: row.server,
    currency: row.currency,
    balance: row.balance,
    equity: row.equity,
    leverage: row.leverage,
  };
}

/** `accounts.symbol_info`, read defensively: anything malformed is dropped. */
export function symbolInfoFromJson(value: unknown): Record<string, SymbolInfo> {
  const out: Record<string, SymbolInfo> = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [symbol, info] of Object.entries(value as Record<string, unknown>)) {
    if (info === null || typeof info !== 'object') continue;
    const { contractSize, digits } = info as Record<string, unknown>;
    if (typeof contractSize === 'number' && contractSize > 0 && typeof digits === 'number' && digits >= 0) {
      out[symbol] = { contractSize, digits };
    }
  }
  return out;
}

/**
 * Equity at entry, for every trade: the latest reported balance walked back
 * through every close that came after the trade opened — its own included,
 * since its P&L was not yet realised when it opened.
 *
 * Honest about its limits: the §12 feed carries buy and sell deals only, so a
 * deposit or withdrawal is invisible to it and floating P&L of other open
 * positions is not counted. Where the walk-back lands at or below zero — a
 * withdrawal it could not see — the current balance stands in rather than a
 * risk % divided by nothing.
 */
export function equityAtEntryByTrade(
  trades: readonly { id: string; openTime: string; closeTime: string; netProfit: number }[],
  balance: number,
): Map<string, number> {
  const closes = trades
    .map((trade) => ({ ms: Date.parse(trade.closeTime), net: trade.netProfit }))
    .sort((a, b) => a.ms - b.ms);
  // suffix[i] = Σ net of closes[i..]
  const suffix = new Array<number>(closes.length + 1).fill(0);
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    suffix[index] = (suffix[index + 1] ?? 0) + (closes[index]?.net ?? 0);
  }

  const out = new Map<string, number>();
  for (const trade of trades) {
    const openMs = Date.parse(trade.openTime);
    // First close strictly after the entry.
    let low = 0;
    let high = closes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((closes[mid]?.ms ?? 0) > openMs) high = mid;
      else low = mid + 1;
    }
    const equity = Math.round((balance - (suffix[low] ?? 0)) * 100) / 100;
    out.set(trade.id, equity > 0 ? equity : balance);
  }
  return out;
}

export function tradeFromRow(row: TradeRow, equityAtEntry: number): Trade {
  return {
    id: row.id,
    positionId: row.position_id,
    symbol: row.symbol,
    magic: row.magic,
    comment: row.comment,
    direction: row.direction === 'sell' ? 'sell' : 'buy',
    volume: row.volume,
    openTime: isoUtc(row.open_time),
    closeTime: isoUtc(row.close_time),
    openPrice: row.open_price,
    closePrice: row.close_price,
    initialSl: row.initial_sl,
    initialTp: row.initial_tp,
    finalSl: row.final_sl,
    finalTp: row.final_tp,
    grossProfit: row.gross_profit,
    commission: row.commission,
    swap: row.swap,
    netProfit: row.net_profit,
    mfePrice: row.mfe_price,
    maePrice: row.mae_price,
    spreadPointsAtEntry: row.spread_points_at_entry,
    spreadPointsAtExit: row.spread_points_at_exit,
    equityAtEntry,
    contractSize: row.contract_size,
    durationSeconds: row.duration_seconds,
    entryDealTicket: row.entry_deal_ticket,
    exitDealTicket: row.exit_deal_ticket,
  };
}

/** Every stored trade, with its equity at entry filled in. */
export function tradesFromRows(rows: readonly TradeRow[], balance: number): Trade[] {
  const partial = rows.map((row) => tradeFromRow(row, 0));
  const equity = equityAtEntryByTrade(partial, balance);
  return partial.map((trade) => ({ ...trade, equityAtEntry: equity.get(trade.id) ?? balance }));
}

export function modificationFromRow(row: ModificationRow): SlModification {
  return { positionId: row.position_id, time: isoUtc(row.time), sl: row.sl, tp: row.tp };
}

const IMPORTANCE: readonly NewsImportance[] = ['low', 'medium', 'high'];

export function newsFromRow(row: NewsRow): NewsEvent {
  return {
    eventId: row.event_id,
    time: isoUtc(row.time),
    currency: row.currency,
    importance: IMPORTANCE.includes(row.importance as NewsImportance) ? (row.importance as NewsImportance) : 'low',
    name: row.name,
  };
}

export function eaFromRow(row: EaRow): Ea {
  return {
    magic: row.magic,
    name: row.name,
    baselineExpectancyR: row.baseline_expectancy_r,
    baselineStdDevR: row.baseline_std_dev_r,
  };
}

/** The thresholds a trader set in Settings (§6.1), as engine overrides. */
export function engineSettingsFromRow(row: SettingsRow | null): Partial<EngineSettings> {
  if (row === null) return {};
  return {
    riskLimitPercent: row.risk_limit_percent,
    dailyMaxTrades: row.daily_max_trades,
    newsWindowMinutes: row.news_window_minutes,
    rolloverWindowMinutes: row.rollover_window_minutes,
    serverUtcOffsetHours: row.server_utc_offset_hours,
  };
}
