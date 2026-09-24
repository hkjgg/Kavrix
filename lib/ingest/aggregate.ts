/**
 * Deals → trades (CLAUDE.md §5: "Trade = one closed position, aggregate of
 * its MT5 deals"). Pure; the ingest pipeline runs it over every position a
 * batch touched.
 *
 * A position is a trade once it is **flat**: its `out` volume equals its `in`
 * volume. Until then — still open, or partly closed — it is not a trade, and
 * nothing is scored for it. Scaling in and partial closes are both handled:
 *
 * - volume = the lots that went in; open price = their volume-weighted mean;
 * - close price = the volume-weighted mean of the lots that came out;
 * - open time = the first `in`, close time = the last `out`;
 * - P&L, commission and swap = the sum over every deal of the position.
 *
 * The stop at entry is the SL on the first `in` deal. §5's 60-second grace
 * ("initial SL = SL at entry, within 60 s") is **not** re-implemented here:
 * a stop attached by a modification shortly after the fill reaches the engine
 * as that modification, and `enrich.ts` — the one place the rule lives —
 * applies the window. A test asserts both sides of it.
 *
 * Contract size comes from the connector's `symbolInfo`, never a constant
 * (§5); a position whose symbol has none cannot be priced and is reported.
 *
 * MFE / MAE: the §12 feed carries fills, not prices in between, so the
 * excursion stored is the one the fills themselves prove — the best and
 * worst fill price of the position. It is a lower bound, never an invention.
 */

import type { Deal, SymbolInfo, Trade } from '@/lib/engine';

/** A rebuilt trade. Equity at entry depends on the whole account, so it is filled in on read. */
export type AggregatedTrade = Omit<Trade, 'equityAtEntry'>;

export interface AggregateResult {
  trades: AggregatedTrade[];
  /** Positions with an `in` still open (fully or in part). */
  open: number[];
  /** Positions that cannot be rebuilt, and why. */
  skipped: { positionId: number; reason: string }[];
}

/** Lots are compared to a millionth: MT5 volume steps are never finer. */
const VOLUME_EPSILON = 1e-6;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function byTime(a: Deal, b: Deal): number {
  return Date.parse(a.time) - Date.parse(b.time) || a.ticket - b.ticket;
}

function weightedPrice(deals: readonly Deal[]): number {
  const volume = deals.reduce((total, deal) => total + deal.volume, 0);
  return volume > 0 ? deals.reduce((total, deal) => total + deal.price * deal.volume, 0) / volume : 0;
}

/** The trade id a position is known by everywhere: the Ledger, the Dossier, the URL. */
export function tradeIdFor(positionId: number): string {
  return `T-${positionId}`;
}

export function aggregatePosition(
  positionId: number,
  deals: readonly Deal[],
  symbolInfo: Readonly<Record<string, SymbolInfo>>,
): { trade: AggregatedTrade } | { open: true } | { skipped: string } {
  const ordered = deals.filter((deal) => deal.positionId === positionId).sort(byTime);
  const ins = ordered.filter((deal) => deal.entry === 'in');
  const outs = ordered.filter((deal) => deal.entry === 'out');
  const first = ins[0];
  const last = outs[outs.length - 1];

  if (first === undefined) {
    // Only exits: the history the connector sent begins after this position opened.
    return { skipped: 'no entry deal — the position opened before the history sent' };
  }
  const inVolume = ins.reduce((total, deal) => total + deal.volume, 0);
  const outVolume = outs.reduce((total, deal) => total + deal.volume, 0);
  if (last === undefined || outVolume < inVolume - VOLUME_EPSILON) return { open: true };
  if (outVolume > inVolume + VOLUME_EPSILON) {
    return { skipped: 'more volume closed than opened — an entry deal is missing' };
  }

  const info = symbolInfo[first.symbol];
  if (info === undefined || !(info.contractSize > 0)) {
    return { skipped: `no contract size for ${first.symbol} — the connector sends it in symbolInfo` };
  }

  const direction = first.type;
  const openMs = Date.parse(first.time);
  const closeMs = Date.parse(last.time);
  const grossProfit = ordered.reduce((total, deal) => total + deal.profit, 0);
  const commission = ordered.reduce((total, deal) => total + deal.commission, 0);
  const swap = ordered.reduce((total, deal) => total + deal.swap, 0);
  const prices = ordered.map((deal) => deal.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const digits = info.digits;

  return {
    trade: {
      id: tradeIdFor(positionId),
      positionId,
      symbol: first.symbol,
      magic: first.magic,
      comment: first.comment,
      direction,
      volume: round(inVolume, 6),
      openTime: new Date(openMs).toISOString(),
      closeTime: new Date(closeMs).toISOString(),
      openPrice: round(weightedPrice(ins), digits + 3),
      closePrice: round(weightedPrice(outs), digits + 3),
      initialSl: first.sl > 0 ? first.sl : null,
      initialTp: first.tp > 0 ? first.tp : null,
      finalSl: last.sl > 0 ? last.sl : null,
      finalTp: last.tp > 0 ? last.tp : null,
      grossProfit: round(grossProfit, 2),
      commission: round(commission, 2),
      swap: round(swap, 2),
      netProfit: round(grossProfit + commission + swap, 2),
      mfePrice: direction === 'buy' ? high : low,
      maePrice: direction === 'buy' ? low : high,
      spreadPointsAtEntry: first.spreadPoints,
      spreadPointsAtExit: last.spreadPoints,
      contractSize: info.contractSize,
      durationSeconds: Math.max(0, Math.round((closeMs - openMs) / 1000)),
      entryDealTicket: first.ticket,
      exitDealTicket: last.ticket,
    },
  };
}

/** Every position among `deals`, rebuilt where it is flat. */
export function aggregateDeals(
  deals: readonly Deal[],
  symbolInfo: Readonly<Record<string, SymbolInfo>>,
): AggregateResult {
  const byPosition = new Map<number, Deal[]>();
  for (const deal of deals) {
    const list = byPosition.get(deal.positionId);
    if (list === undefined) byPosition.set(deal.positionId, [deal]);
    else list.push(deal);
  }

  const result: AggregateResult = { trades: [], open: [], skipped: [] };
  for (const positionId of [...byPosition.keys()].sort((a, b) => a - b)) {
    const outcome = aggregatePosition(positionId, byPosition.get(positionId) ?? [], symbolInfo);
    if ('trade' in outcome) result.trades.push(outcome.trade);
    else if ('open' in outcome) result.open.push(positionId);
    else result.skipped.push({ positionId, reason: outcome.skipped });
  }
  return result;
}
