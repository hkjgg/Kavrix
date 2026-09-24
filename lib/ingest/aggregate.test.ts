import { describe, expect, it } from 'vitest';
import type { Deal, SlModification, Trade } from '@/lib/engine';
import { enrichTrades, resolveSettings } from '@/lib/engine';
import { getDemoDataset } from '@/lib/demo/assay';
import { tradesFromRows } from '@/lib/account/rows';
import { tradeToRow } from './memoryStore';
import { aggregateDeals, aggregatePosition, tradeIdFor } from './aggregate';

const GOLD = { XAUUSD: { contractSize: 100, digits: 2 } };

function deal(overrides: Partial<Deal>): Deal {
  return {
    ticket: 1,
    positionId: 500,
    time: '2026-09-01T08:00:00.000Z',
    type: 'buy',
    entry: 'in',
    symbol: 'XAUUSD',
    volume: 1,
    price: 2400,
    sl: 2390,
    tp: 2420,
    profit: 0,
    commission: -3.5,
    swap: 0,
    magic: 0,
    comment: '',
    spreadPoints: 20,
    ...overrides,
  };
}

function aggregate(deals: Deal[]): Omit<Trade, 'equityAtEntry'> {
  const result = aggregatePosition(500, deals, GOLD);
  if (!('trade' in result)) throw new Error(`not a trade: ${JSON.stringify(result)}`);
  return result.trade;
}

describe('deals → trades', () => {
  it('adds up a simple round turn', () => {
    const trade = aggregate([
      deal({}),
      deal({ ticket: 2, entry: 'out', type: 'sell', time: '2026-09-01T08:30:00.000Z', price: 2410, profit: 1000, sl: 2390, spreadPoints: 25 }),
    ]);
    expect(trade).toMatchObject({
      id: tradeIdFor(500),
      direction: 'buy',
      volume: 1,
      openPrice: 2400,
      closePrice: 2410,
      initialSl: 2390,
      initialTp: 2420,
      finalSl: 2390,
      grossProfit: 1000,
      commission: -7,
      swap: 0,
      netProfit: 993,
      contractSize: 100,
      durationSeconds: 1800,
      spreadPointsAtEntry: 20,
      spreadPointsAtExit: 25,
      entryDealTicket: 1,
      exitDealTicket: 2,
    });
  });

  it('closes in parts: a trade only once flat, at the volume-weighted exit', () => {
    const entry = deal({});
    const firstHalf = deal({ ticket: 2, entry: 'out', type: 'sell', time: '2026-09-01T08:10:00.000Z', volume: 0.4, price: 2405, profit: 200, commission: -1.4 });
    expect(aggregatePosition(500, [entry, firstHalf], GOLD)).toEqual({ open: true });

    const rest = deal({ ticket: 3, entry: 'out', type: 'sell', time: '2026-09-01T08:40:00.000Z', volume: 0.6, price: 2415, profit: 900, commission: -2.1, swap: -1.2 });
    const trade = aggregate([rest, entry, firstHalf]); // arrival order does not matter
    expect(trade.volume).toBe(1);
    // (0.4 × 2405 + 0.6 × 2415) ÷ 1.0 = 2411
    expect(trade.closePrice).toBe(2411);
    expect(trade.grossProfit).toBe(1100);
    expect(trade.commission).toBe(-7);
    expect(trade.swap).toBe(-1.2);
    expect(trade.netProfit).toBe(1091.8);
    expect(trade.closeTime).toBe('2026-09-01T08:40:00.000Z');
    expect(trade.exitDealTicket).toBe(3);
  });

  it('scales in: volume adds up, the entry is the weighted mean, the stop is the first fill’s', () => {
    const trade = aggregate([
      deal({ ticket: 1, volume: 0.5, price: 2400, sl: 2390 }),
      deal({ ticket: 2, volume: 0.5, price: 2404, sl: 2395, time: '2026-09-01T08:05:00.000Z' }),
      deal({ ticket: 3, entry: 'out', type: 'sell', volume: 1, price: 2412, profit: 1000, time: '2026-09-01T09:00:00.000Z' }),
    ]);
    expect(trade.volume).toBe(1);
    expect(trade.openPrice).toBe(2402);
    expect(trade.initialSl).toBe(2390);
  });

  it('reads the excursion the fills prove, and no more', () => {
    const sell = aggregate([
      deal({ type: 'sell', price: 2400, sl: 2410 }),
      deal({ ticket: 2, entry: 'out', type: 'buy', price: 2390, profit: 1000, time: '2026-09-01T09:00:00.000Z' }),
    ]);
    expect(sell.mfePrice).toBe(2390);
    expect(sell.maePrice).toBe(2400);
  });

  it('skips what cannot be rebuilt, and says why', () => {
    const exitOnly = aggregatePosition(500, [deal({ entry: 'out', type: 'sell' })], GOLD);
    expect(exitOnly).toEqual({ skipped: expect.stringContaining('no entry deal') });
    const overClosed = aggregatePosition(500, [deal({}), deal({ ticket: 2, entry: 'out', type: 'sell', volume: 2 })], GOLD);
    expect(overClosed).toEqual({ skipped: expect.stringContaining('more volume closed') });
    const unpriced = aggregatePosition(500, [deal({ symbol: 'XAUEUR' }), deal({ ticket: 2, symbol: 'XAUEUR', entry: 'out', type: 'sell' })], GOLD);
    expect(unpriced).toEqual({ skipped: expect.stringContaining('no contract size for XAUEUR') });
  });

  it('never hardcodes a contract size', () => {
    const trade = aggregatePosition(
      500,
      [deal({ symbol: 'GOLD.m' }), deal({ ticket: 2, symbol: 'GOLD.m', entry: 'out', type: 'sell' })],
      { 'GOLD.m': { contractSize: 10, digits: 3 } },
    );
    expect('trade' in trade && trade.trade.contractSize).toBe(10);
  });

  it('groups a batch by position, oldest id first', () => {
    const result = aggregateDeals(
      [
        deal({ ticket: 10, positionId: 2 }),
        deal({ ticket: 11, positionId: 2, entry: 'out', type: 'sell' }),
        deal({ ticket: 12, positionId: 1 }),
      ],
      GOLD,
    );
    expect(result.trades.map((trade) => trade.positionId)).toEqual([2]);
    expect(result.open).toEqual([1]);
  });
});

describe('the stop at entry — §5’s 60 seconds live in the engine', () => {
  const settings = resolveSettings();
  const entry = deal({ sl: 0 });
  const exit = deal({ ticket: 2, entry: 'out', type: 'sell', time: '2026-09-01T08:30:00.000Z', price: 2395, profit: -500 });

  function enriched(modifications: SlModification[], entryDeal: Deal = entry) {
    const trade = { ...aggregate([entryDeal, exit]), equityAtEntry: 100_000 };
    return enrichTrades({ trades: [trade], modifications, calendar: [] }, settings)[0]!;
  }

  it('a stop attached 30 s after the fill is the initial stop', () => {
    const trade = enriched([{ positionId: 500, time: '2026-09-01T08:00:30.000Z', sl: 2390, tp: 0 }]);
    expect(trade.noStop).toBe(false);
    expect(trade.initialSlAfterSeconds).toBe(30);
    expect(trade.slCompliant).toBe(true);
  });

  it('a stop set late — 2 minutes after — is no stop at entry', () => {
    const trade = enriched([{ positionId: 500, time: '2026-09-01T08:02:00.000Z', sl: 2390, tp: 0 }]);
    expect(trade.noStop).toBe(true);
    expect(trade.slCompliant).toBe(false);
  });

  it('a stop widened after entry is not compliant; trailed closer, it is', () => {
    const withStop = deal({ sl: 2390 });
    const widened = enriched([{ positionId: 500, time: '2026-09-01T08:10:00.000Z', sl: 2380, tp: 0 }], withStop);
    expect(widened.slWidened).toBe(true);
    expect(widened.slCompliant).toBe(false);
    const trailed = enriched([{ positionId: 500, time: '2026-09-01T08:10:00.000Z', sl: 2396, tp: 0 }], withStop);
    expect(trailed.slWidened).toBe(false);
    expect(trailed.slCompliant).toBe(true);
  });
});

describe('the demo, rebuilt from its own deals', () => {
  const data = getDemoDataset();
  const rebuilt = aggregateDeals(data.deals, data.symbolInfo);

  it('rebuilds every one of its trades, and nothing else', () => {
    expect(rebuilt.trades).toHaveLength(data.trades.length);
    expect(rebuilt.open).toEqual([]);
    expect(rebuilt.skipped).toEqual([]);
  });

  it('matches the generator field for field, except the excursion (fills only)', () => {
    const byId = new Map(data.trades.map((trade) => [trade.id, trade]));
    for (const trade of rebuilt.trades) {
      const original = byId.get(trade.id);
      expect(original, trade.id).toBeDefined();
      const expected: Record<string, unknown> = { ...original! };
      const actual: Record<string, unknown> = { ...trade };
      for (const key of ['mfePrice', 'maePrice', 'equityAtEntry']) {
        delete expected[key];
        delete actual[key];
      }
      // The generator writes −0 where MT5 would print 0; the values are equal.
      expect(actual).toEqual(JSON.parse(JSON.stringify(expected)));
    }
  });

  it('walks equity back to the balance at entry: the starting balance plus every close before it', () => {
    const trades = tradesFromRows(rebuilt.trades.map(tradeToRow('demo')), data.account.balance);
    const closes = data.trades.map((trade) => ({ ms: Date.parse(trade.closeTime), net: trade.netProfit }));
    for (const trade of trades) {
      const openMs = Date.parse(trade.openTime);
      const forward = closes.filter((close) => close.ms <= openMs).reduce((total, close) => total + close.net, data.meta.startingBalance);
      expect(trade.equityAtEntry, trade.id).toBeCloseTo(forward, 2);
    }
  });
});
