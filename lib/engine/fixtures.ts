/**
 * Hand-built fixtures for the engine tests.
 *
 * Every default is chosen so the arithmetic can be checked in your head:
 * equity is $10,000, a trade risks 10.00 of price on 0.10 lots of a 100-unit
 * contract — $100, exactly 1% of equity, exactly the default limit. So a
 * `netProfit` of −$150 is −1.5R and a `slDistance` of 15 is 1.5% risk, with no
 * arithmetic left over.
 *
 * This file holds no assertions and no engine logic; it only builds `Trade`
 * objects in the shape the connector sends (CLAUDE.md §12).
 */

import type { NewsEvent, SlModification, Trade } from './types';

/** Equity every fixture trade is entered on. */
export const FIXTURE_EQUITY = 10_000;
/** XAUUSD: 100 oz per lot (CLAUDE.md §5). */
export const FIXTURE_CONTRACT_SIZE = 100;
/** 0.10 lots × 100 oz × 10.00 of price = $100 = 1% of equity. */
export const FIXTURE_VOLUME = 0.1;
export const FIXTURE_OPEN_PRICE = 2400;
/** The stop distance that makes risk exactly 1% — one clean R. */
export const FIXTURE_SL_DISTANCE = 10;
/** $100 of risk: 1R in every fixture unless the spec changes the distance. */
export const FIXTURE_RISK = 100;

export interface TradeSpec {
  id?: string;
  /** Position id. `makeTrades` numbers a list from 1 so fixtures stay stable. */
  positionId?: number;
  /** ISO 8601, `Z`. */
  openTime: string;
  durationMinutes?: number;
  volume?: number;
  direction?: 'buy' | 'sell';
  openPrice?: number;
  /**
   * Distance from entry to the initial stop, in price. `null` opens the trade
   * without one.
   */
  slDistance?: number | null;
  /** Net P&L after costs. Default +$100, which is +1R at the default risk. */
  netProfit?: number;
  equityAtEntry?: number;
  magic?: number;
  comment?: string;
  /** Favourable excursion distance from entry, in price. */
  mfeDistance?: number;
  /** Adverse excursion distance from entry, in price. */
  maeDistance?: number;
  spreadPoints?: number;
}

let sequence = 0;

/** Builds one `Trade`. Unset fields take the documented defaults above. */
export function makeTrade(spec: TradeSpec): Trade {
  sequence += 1;
  const id = spec.id ?? `t${sequence}`;
  const positionId = spec.positionId ?? sequence;
  const direction = spec.direction ?? 'buy';
  const sign = direction === 'buy' ? 1 : -1;
  const openPrice = spec.openPrice ?? FIXTURE_OPEN_PRICE;
  const slDistance = spec.slDistance === undefined ? FIXTURE_SL_DISTANCE : spec.slDistance;
  const netProfit = spec.netProfit ?? 100;
  const volume = spec.volume ?? FIXTURE_VOLUME;
  const durationMinutes = spec.durationMinutes ?? 60;
  const openMs = Date.parse(spec.openTime);
  const closeMs = openMs + durationMinutes * 60_000;
  const contractSize = FIXTURE_CONTRACT_SIZE;
  const closePrice = openPrice + (sign * netProfit) / (volume * contractSize);

  return {
    id,
    positionId,
    symbol: 'XAUUSD',
    magic: spec.magic ?? 0,
    comment: spec.comment ?? '',
    direction,
    volume,
    openTime: new Date(openMs).toISOString(),
    closeTime: new Date(closeMs).toISOString(),
    openPrice,
    closePrice: Number(closePrice.toFixed(2)),
    initialSl: slDistance === null ? null : openPrice - sign * slDistance,
    initialTp: null,
    finalSl: slDistance === null ? null : openPrice - sign * slDistance,
    finalTp: null,
    grossProfit: netProfit,
    commission: 0,
    swap: 0,
    netProfit,
    mfePrice: openPrice + sign * (spec.mfeDistance ?? Math.max(0, netProfit) / (volume * contractSize)),
    maePrice: openPrice - sign * (spec.maeDistance ?? Math.max(0, -netProfit) / (volume * contractSize)),
    spreadPointsAtEntry: spec.spreadPoints ?? 22,
    spreadPointsAtExit: spec.spreadPoints ?? 22,
    equityAtEntry: spec.equityAtEntry ?? FIXTURE_EQUITY,
    contractSize,
    durationSeconds: durationMinutes * 60,
    entryDealTicket: positionId * 2 - 1,
    exitDealTicket: positionId * 2,
  };
}

/**
 * Builds a list of trades with stable `t1…tn` ids and position ids.
 *
 * Stable matters: two calls with the same specs must produce identical trades,
 * or a determinism test would be testing the fixture rather than the engine.
 */
export function makeTrades(specs: readonly TradeSpec[]): Trade[] {
  return specs.map((spec, index) =>
    makeTrade({ id: `t${index + 1}`, positionId: index + 1, ...spec }),
  );
}

/** A high-impact USD release. */
export function makeNews(time: string, name = 'US Non-Farm Payrolls', eventId = 1): NewsEvent {
  return { eventId, time, currency: 'USD', importance: 'high', name };
}

/** An SL/TP change on an open position. */
export function makeModification(
  positionId: number,
  time: string,
  sl: number,
  tp = 0,
): SlModification {
  return { positionId, time, sl, tp };
}
