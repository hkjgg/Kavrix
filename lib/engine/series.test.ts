/**
 * Karat series tests (CLAUDE.md §8.1, §8.4).
 *
 * One point per UTC day, each scored at the end of its day with the same
 * rolling window as the live score — so the Purity Line and the dial can never
 * disagree about what the Karat was on a given day.
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades } from './enrich';
import type { EnrichedTrade } from './enrich';
import { computeKaratSeries, karatAt, karatDelta } from './series';
import { DEFAULT_SETTINGS } from './settings';
import { DAY_MS, toMs } from './time';
import { makeTrades } from './fixtures';
import type { TradeSpec } from './fixtures';

function dayAfter(start: string, days: number): string {
  return new Date(toMs(`${start}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** One trade a day, starting on `start`. */
function daily(start: string, count: number, spec: Partial<TradeSpec> = {}): TradeSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    openTime: `${dayAfter(start, index)}T09:00:00Z`,
    durationMinutes: 45,
    ...spec,
  }));
}

function enrich(specs: readonly TradeSpec[]): EnrichedTrade[] {
  return enrichTrades({ trades: makeTrades(specs), modifications: [], calendar: [] }, DEFAULT_SETTINGS);
}

describe('daily series', () => {
  const trades = enrich(daily('2026-06-01', 12));
  const asOf = toMs('2026-06-12T12:00:00Z');
  const series = computeKaratSeries(trades, DEFAULT_SETTINGS, asOf);

  it('emits one point a day from the first trade to asOf', () => {
    expect(series).toHaveLength(12);
    expect(series[0]?.date).toBe('2026-06-01');
    expect(series[11]?.date).toBe('2026-06-12');
  });

  it('stays in Assaying… until the tenth trade', () => {
    expect(series[8]?.state).toBe('assaying');
    expect(series[8]?.karat).toBeNull();
    expect(series[9]?.state).toBe('scored');
    expect(series[9]?.karat).toBe(24);
  });

  it('counts the trades behind each point', () => {
    expect(series[11]?.windowTradeCount).toBe(12);
    expect(series[11]?.dayTradeCount).toBe(1);
  });

  it('agrees with the live score at the same instant', () => {
    const endOfDay = toMs('2026-06-12T23:59:59.999Z');
    const live = karatAt(trades, DEFAULT_SETTINGS, endOfDay);
    const last = computeKaratSeries(trades, DEFAULT_SETTINGS, endOfDay).at(-1);
    expect(last?.karat).toBe(live.karat);
    expect(last?.points).toBe(live.points);
  });

  it('is empty without manual trades', () => {
    expect(
      computeKaratSeries(enrich(daily('2026-06-01', 5, { magic: 1001 })), DEFAULT_SETTINGS, asOf),
    ).toEqual([]);
  });
});

describe('delta vs last week (§8.1)', () => {
  it('reports the week-on-week move of the same score', () => {
    // Ten no-stop losses, then ten clean trades: the score has to rise.
    const trades = enrich([
      ...daily('2026-06-01', 10, { slDistance: null, netProfit: -150 }),
      ...daily('2026-06-11', 10),
    ]);
    const asOf = toMs('2026-06-20T23:59:59Z');
    const delta = karatDelta(trades, DEFAULT_SETTINGS, asOf);

    expect(delta.days).toBe(7);
    expect(delta.current).not.toBeNull();
    expect(delta.previous).not.toBeNull();
    expect(delta.delta).toBeGreaterThan(0);
    expect(delta.delta).toBe(
      Number(((delta.current ?? 0) - (delta.previous ?? 0)).toFixed(1)),
    );
  });

  it('reports nothing when last week was still assaying', () => {
    const trades = enrich(daily('2026-06-01', 12));
    const delta = karatDelta(trades, DEFAULT_SETTINGS, toMs('2026-06-12T12:00:00Z'));
    expect(delta.current).toBe(24);
    expect(delta.previous).toBeNull();
    expect(delta.delta).toBeNull();
  });
});
