/**
 * Similar Trades (CLAUDE.md §6.9).
 *
 * The rule the tests exist for: **no hindsight**. A neighbour must have closed
 * before the target opened, and nothing about the target's own outcome may
 * enter the distance.
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades } from './enrich';
import type { TradeSpec } from './fixtures';
import { makeNews, makeTrades } from './fixtures';
import { resolveSettings } from './settings';
import {
  SIMILAR_FEATURES,
  entryVolatilities,
  featureVector,
  findSimilarTrades,
} from './similar';
import { DAY_MS } from './time';

const settings = resolveSettings();
const MONDAY = Date.parse('2026-03-02T00:00:00.000Z');

function at(dayOffset: number, hour: number, minute = 0): string {
  return new Date(
    MONDAY + dayOffset * DAY_MS + hour * 3_600_000 + minute * 60_000,
  ).toISOString();
}

function build(specs: readonly TradeSpec[], calendar = [] as ReturnType<typeof makeNews>[]) {
  return enrichTrades(
    { trades: makeTrades(specs.slice()), modifications: [], calendar },
    settings,
  );
}

describe('entryVolatilities', () => {
  it('measures only trades that had already opened', () => {
    const trades = build([
      { openTime: at(0, 8), openPrice: 2400 },
      { openTime: at(0, 9), openPrice: 2410 },
      { openTime: at(0, 10), openPrice: 2420 },
      { openTime: at(0, 11), openPrice: 2500 },
    ]);
    const volatilities = entryVolatilities(trades, settings.similarVolatilityLookback);
    // The first two have nothing behind them, so they carry no measurement.
    expect(volatilities.get(trades[0]!.id)).toBe(0);
    expect(volatilities.get(trades[1]!.id)).toBe(0);
    // The third sees two steady +10/h moves; the fourth still sees only those,
    // because the 80-point jump is the move it is being opened into.
    expect(volatilities.get(trades[2]!.id)).toBe(0);
    expect(volatilities.get(trades[3]!.id)).toBe(0);
  });

  it('rises once the path in front of a trade has been uneven', () => {
    const trades = build([
      { openTime: at(0, 8), openPrice: 2400 },
      { openTime: at(0, 9), openPrice: 2410 },
      { openTime: at(0, 10), openPrice: 2500 },
      { openTime: at(0, 11), openPrice: 2505 },
    ]);
    const volatilities = entryVolatilities(trades, settings.similarVolatilityLookback);
    expect(volatilities.get(trades[3]!.id)).toBeGreaterThan(0);
  });
});

describe('featureVector', () => {
  it('holds one value per named feature, none of them an outcome', () => {
    const trades = build([{ openTime: at(0, 8), netProfit: 500 }]);
    const vector = featureVector(trades[0]!, 0);
    expect(vector).toHaveLength(SIMILAR_FEATURES.length);
    for (const value of vector) expect(Number.isFinite(value)).toBe(true);
  });

  it('puts 23:00 and 01:00 two hours apart, not twenty-two', () => {
    const trades = build([
      { openTime: at(0, 23) },
      { openTime: at(1, 1) },
      { openTime: at(1, 12) },
    ]);
    const [late, early, noon] = trades.map((trade) => featureVector(trade, 0));
    const gap = (a: number[], b: number[]): number =>
      Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0));
    expect(gap(late!, early!)).toBeLessThan(gap(late!, noon!));
  });

  it('does not move when the trade result changes', () => {
    const won = build([{ openTime: at(0, 8), netProfit: 900 }]);
    const lost = build([{ openTime: at(0, 8), netProfit: -900 }]);
    expect(featureVector(won[0]!, 0)).toEqual(featureVector(lost[0]!, 0));
  });
});

describe('findSimilarTrades', () => {
  /** Twenty prior trades over four days, then a target on the fifth. */
  function history(): TradeSpec[] {
    const specs: TradeSpec[] = [];
    for (let day = 0; day < 4; day += 1) {
      for (let index = 0; index < 5; index += 1) {
        specs.push({
          openTime: at(day, 8 + index),
          durationMinutes: 30,
          netProfit: index === 0 ? 300 : -100,
        });
      }
    }
    return specs;
  }

  it('returns k neighbours, all of them closed before the target opened', () => {
    const trades = build([...history(), { openTime: at(4, 9), durationMinutes: 30 }]);
    const target = trades[trades.length - 1]!;
    const result = findSimilarTrades(target, trades, settings);

    expect(result.k).toBe(12);
    expect(result.neighbours).toHaveLength(12);
    expect(result.eligibleCount).toBe(20);
    const byId = new Map(trades.map((trade) => [trade.id, trade]));
    for (const neighbour of result.neighbours) {
      expect(byId.get(neighbour.tradeId)!.closeTimeMs).toBeLessThan(target.openTimeMs);
    }
  });

  it('never returns the target itself', () => {
    const trades = build([...history(), { openTime: at(4, 9), durationMinutes: 30 }]);
    const target = trades[trades.length - 1]!;
    const result = findSimilarTrades(target, trades, settings);
    expect(result.neighbours.map((neighbour) => neighbour.tradeId)).not.toContain(
      target.id,
    );
  });

  it('never returns a trade still open at entry, however close it looks', () => {
    // A trade opened an hour earlier and held for a week: the nearest thing in
    // the feature space, and not yet something the trader had learned from.
    const trades = build([
      ...history(),
      { openTime: at(4, 8), durationMinutes: 60 * 24 * 7 },
      { openTime: at(4, 9), durationMinutes: 30 },
    ]);
    const target = trades[trades.length - 1]!;
    const stillOpen = trades[trades.length - 2]!;
    const result = findSimilarTrades(target, trades, settings);
    expect(result.neighbours.map((neighbour) => neighbour.tradeId)).not.toContain(
      stillOpen.id,
    );
  });

  it('never looks forward, even at an identical trade', () => {
    const trades = build([
      ...history(),
      { openTime: at(4, 9), durationMinutes: 30 },
      { openTime: at(5, 9), durationMinutes: 30 },
    ]);
    const target = trades[trades.length - 2]!;
    const future = trades[trades.length - 1]!;
    const result = findSimilarTrades(target, trades, settings);
    expect(result.neighbours.map((neighbour) => neighbour.tradeId)).not.toContain(
      future.id,
    );
  });

  it('orders neighbours by distance, nearest first', () => {
    const trades = build([...history(), { openTime: at(4, 9), durationMinutes: 30 }]);
    const result = findSimilarTrades(trades[trades.length - 1]!, trades, settings);
    for (let i = 1; i < result.neighbours.length; i += 1) {
      expect(result.neighbours[i]!.distance).toBeGreaterThanOrEqual(
        result.neighbours[i - 1]!.distance,
      );
    }
  });

  it('puts the same hour of the day nearest', () => {
    // Four prior days of trades at 08:00 and at 18:00; the target is at 08:00.
    const specs: TradeSpec[] = [];
    for (let day = 0; day < 6; day += 1) {
      specs.push({ openTime: at(day, 8), durationMinutes: 30 });
      specs.push({ openTime: at(day, 18), durationMinutes: 30 });
    }
    specs.push({ openTime: at(6, 8), durationMinutes: 30 });
    const trades = build(specs);
    const target = trades[trades.length - 1]!;
    const byId = new Map(trades.map((trade) => [trade.id, trade]));
    const result = findSimilarTrades(target, trades, settings, { k: 4 });
    for (const neighbour of result.neighbours) {
      expect(byId.get(neighbour.tradeId)!.hourUtc).toBe(8);
    }
  });

  it('summarises the neighbourhood with its confidence', () => {
    const trades = build([...history(), { openTime: at(4, 9), durationMinutes: 30 }]);
    const result = findSimilarTrades(trades[trades.length - 1]!, trades, settings);
    expect(result.wins + result.losses).toBe(12);
    expect(result.confidence.n).toBe(12);
    // Twelve trades can never be Strong (§6.6): that needs twenty.
    expect(result.confidence.label).not.toBe('strong');
    expect(result.headline).toContain('12 earlier trades');
  });

  it('keeps manual trades and EA trades apart', () => {
    const specs = [
      ...history().map((spec) => ({ ...spec, magic: 1001 })),
      { openTime: at(4, 9), durationMinutes: 30 },
    ];
    const trades = build(specs);
    const result = findSimilarTrades(trades[trades.length - 1]!, trades, settings);
    expect(result.eligibleCount).toBe(0);
    expect(result.neighbours).toEqual([]);
    expect(result.headline).toContain('No trade had closed');
  });

  it('returns fewer than k when the history is short', () => {
    const trades = build([
      { openTime: at(0, 8), durationMinutes: 30 },
      { openTime: at(0, 9), durationMinutes: 30 },
      { openTime: at(0, 10), durationMinutes: 30 },
    ]);
    const result = findSimilarTrades(trades[2]!, trades, settings);
    expect(result.neighbours).toHaveLength(2);
  });

  it('is deterministic', () => {
    const trades = build([...history(), { openTime: at(4, 9), durationMinutes: 30 }]);
    const target = trades[trades.length - 1]!;
    expect(findSimilarTrades(target, trades, settings)).toEqual(
      findSimilarTrades(target, trades, settings),
    );
  });
});
