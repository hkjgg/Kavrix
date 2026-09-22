/**
 * Aggregate tests (CLAUDE.md §8).
 *
 * These feed the Purity Line, the Gold Clock and the Vault, so what is checked
 * here is that a grouping never invents or drops a trade.
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades } from './enrich';
import type { EnrichedTrade } from './enrich';
import { computeStats, rankHourWindows } from './stats';
import { DEFAULT_SETTINGS } from './settings';
import { makeTrades } from './fixtures';
import type { TradeSpec } from './fixtures';

function enrich(specs: readonly TradeSpec[]): EnrichedTrade[] {
  return enrichTrades({ trades: makeTrades(specs), modifications: [], calendar: [] }, DEFAULT_SETTINGS);
}

describe('equity curve', () => {
  const trades = enrich([
    { openTime: '2026-06-01T09:00:00Z', durationMinutes: 30, netProfit: 100 },
    { openTime: '2026-06-01T11:00:00Z', durationMinutes: 30, netProfit: -50 },
    { openTime: '2026-06-02T09:00:00Z', durationMinutes: 30, netProfit: 200 },
  ]);
  const stats = computeStats(trades, DEFAULT_SETTINGS);

  it('runs from the first trade equity and accumulates money and R', () => {
    expect(stats.startingEquity).toBe(10_000);
    expect(stats.equityCurve.map((point) => point.equity)).toEqual([10_100, 10_050, 10_250]);
    expect(stats.equityCurve.map((point) => point.cumulativeR)).toEqual([1, 0.5, 2.5]);
    expect(stats.endingEquity).toBe(10_250);
    expect(stats.netMoney).toBe(250);
    expect(stats.netR).toBe(2.5);
  });

  it('orders by close time', () => {
    const outOfOrder = enrich([
      { openTime: '2026-06-01T09:00:00Z', durationMinutes: 600, netProfit: 100 },
      { openTime: '2026-06-01T10:00:00Z', durationMinutes: 30, netProfit: -50 },
    ]);
    expect(computeStats(outOfOrder, DEFAULT_SETTINGS).equityCurve.map((point) => point.tradeId)).toEqual(
      ['t2', 't1'],
    );
  });
});

describe('buckets', () => {
  const trades = enrich([
    { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: 100 }, // Mon, Asia + London
    { openTime: '2026-06-01T13:00:00Z', durationMinutes: 30, netProfit: -50 }, // Mon, London + NY
    { openTime: '2026-06-02T22:00:00Z', durationMinutes: 30, netProfit: 200 }, // Tue, no session
  ]);
  const stats = computeStats(trades, DEFAULT_SETTINGS);

  it('counts an overlapping trade in both of its sessions', () => {
    const bySession = new Map(stats.bySession.map((entry) => [entry.key, entry]));
    expect(bySession.get('asia')?.tradeCount).toBe(1);
    expect(bySession.get('london')?.tradeCount).toBe(2);
    expect(bySession.get('newYork')?.tradeCount).toBe(1);
    expect(bySession.get('none')?.tradeCount).toBe(1);
  });

  it('keeps 24 hour buckets and 7 weekday buckets', () => {
    expect(stats.byHour).toHaveLength(24);
    expect(stats.byWeekday).toHaveLength(7);
    expect(stats.byHour[8]?.tradeCount).toBe(1);
    expect(stats.byWeekday[1]?.label).toBe('Monday');
    expect(stats.byWeekday[1]?.tradeCount).toBe(2);
    expect(stats.byWeekday[2]?.netMoney).toBe(200);
  });

  it('engraves each calendar day with its own Karat', () => {
    expect(stats.calendarDays).toHaveLength(2);
    expect(stats.calendarDays[0]?.date).toBe('2026-06-01');
    expect(stats.calendarDays[0]?.netMoney).toBe(50);
    expect(stats.calendarDays[0]?.tradeCount).toBe(2);
    // Two clean trades: a perfect day.
    expect(stats.calendarDays[0]?.karat).toBe(24);
  });

  it('leaves a day of EA trades unengraved', () => {
    const eaOnly = computeStats(
      enrich([{ openTime: '2026-06-01T09:00:00Z', magic: 1001, netProfit: 100 }]),
      DEFAULT_SETTINGS,
    );
    expect(eaOnly.calendarDays[0]?.karat).toBeNull();
    expect(eaOnly.calendarDays[0]?.manualTradeCount).toBe(0);
  });
});

describe('hour windows', () => {
  const trades = enrich([
    // Twelve small winners at 07:00–09:00 — the real edge.
    ...Array.from({ length: 12 }, (_, index) => ({
      openTime: `2026-06-${String(index + 1).padStart(2, '0')}T07:00:00Z`,
      durationMinutes: 30,
      netProfit: 100,
    })),
    // Two luckier trades at 03:00 — a better average, a thinner sample.
    ...Array.from({ length: 2 }, (_, index) => ({
      openTime: `2026-06-${String(index + 1).padStart(2, '0')}T03:00:00Z`,
      durationMinutes: 30,
      netProfit: 500,
    })),
  ]);

  it('ranks by total R, so a thin lucky window cannot win', () => {
    const best = rankHourWindows(trades)[0];
    expect(best?.startHour).toBe(5);
    expect(best?.endHour).toBe(8);
    expect(best?.tradeCount).toBe(12);
    expect(best?.netR).toBe(12);
    expect(best?.avgR).toBe(1);
  });

  it('ignores windows under the minimum sample', () => {
    expect(rankHourWindows(trades, { minTrades: 13 })).toEqual([]);
  });
});
