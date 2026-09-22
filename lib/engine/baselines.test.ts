/**
 * Personal baselines (CLAUDE.md §6.7).
 *
 * The fixtures are built so every p90 can be read off by hand: twenty-one
 * baseline trades at a known lot, then a week of larger ones.
 */

import { describe, expect, it } from 'vitest';
import { computeBaselines } from './baselines';
import { enrichTrades } from './enrich';
import { makeTrades } from './fixtures';
import { quantile } from './math';
import { resolveSettings } from './settings';
import { DAY_MS } from './time';

const settings = resolveSettings();
const AS_OF = Date.parse('2026-04-30T00:00:00.000Z');

/** A day's worth of trades `daysAgo` before `asOf`, at a fixed lot. */
function day(daysAgo: number, volumes: readonly number[]) {
  const dayMs = AS_OF - daysAgo * DAY_MS;
  return volumes.map((volume, index) => ({
    // 08:00 onwards, well clear of the rollover window and any news.
    openTime: new Date(dayMs + (8 + index) * 3_600_000).toISOString(),
    volume,
    // Risk stays at 1% whatever the lot: the stop distance is scaled with it,
    // so `volume` is the only thing these fixtures vary. Every lot used here
    // divides 0.10 exactly, so the scaled stop distance is exact and no trade
    // tips over the limit on a floating-point remainder.
    slDistance: 10 / (volume / 0.1),
    durationMinutes: 30,
    netProfit: index % 3 === 0 ? -100 : 100,
  }));
}

function build(specs: ReturnType<typeof day>) {
  return enrichTrades(
    { trades: makeTrades(specs), modifications: [], calendar: [] },
    settings,
  );
}

describe('quantile', () => {
  it('interpolates the way R and NumPy do', () => {
    // Ten values, q = 0.9 → position 8.1 → v[8] + 0.1 × (v[9] − v[8]).
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    expect(quantile(values, 0.9)).toBeCloseTo(9 + 0.1 * 91, 10);
    expect(quantile(values, 0.5)).toBeCloseTo(5.5, 10);
    expect(quantile(values, 0)).toBe(1);
    expect(quantile(values, 1)).toBe(100);
  });

  it('sorts its input and leaves it alone', () => {
    const values = [5, 1, 3];
    expect(quantile(values, 0.5)).toBe(3);
    expect(values).toEqual([5, 1, 3]);
  });

  it('is total on empty and single-value samples', () => {
    expect(quantile([], 0.9)).toBe(0);
    expect(quantile([7], 0.9)).toBe(7);
  });
});

describe('computeBaselines', () => {
  it('stays quiet until the baseline is long enough to be anybody normal', () => {
    const trades = build([...day(20, [0.1, 0.1]), ...day(2, [0.5])]);
    const result = computeBaselines(trades, settings, AS_OF);
    expect(result.measurable).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.hiddenReason).toContain('20 trades');
  });

  it('measures the p90 of the trader own history, excluding the recent window', () => {
    // Baseline: 21 trades at 0.10 lots, then one day of 0.50 inside the recent
    // week. If the recent week leaked into the baseline, the p90 would move.
    const trades = build([
      ...day(40, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(30, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(20, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(2, [0.5, 0.5, 0.5]),
    ]);
    const result = computeBaselines(trades, settings, AS_OF);
    expect(result.measurable).toBe(true);
    expect(result.baselineTradeCount).toBe(21);
    expect(result.recentTradeCount).toBe(3);

    const volume = result.metrics.find((metric) => metric.key === 'volume');
    expect(volume?.median).toBe(0.1);
    expect(volume?.p90).toBe(0.1);
    expect(volume?.recentMedian).toBe(0.5);
  });

  it('flags a recent week outside the trader own p90', () => {
    const trades = build([
      ...day(40, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2]),
      ...day(30, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2]),
      ...day(20, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2]),
      ...day(2, [0.8, 0.8, 0.8]),
    ]);
    const result = computeBaselines(trades, settings, AS_OF);
    const volume = result.metrics.find((metric) => metric.key === 'volume');
    expect(volume?.outsideNormal).toBe(true);
    expect(volume?.exceedingTradeIds).toHaveLength(3);
    expect(volume?.exceedancePercent).toBeGreaterThan(0);

    const finding = result.findings.find((entry) => entry.metric === 'volume');
    expect(finding?.id).toBe('outside-normal-volume');
    expect(finding?.headline).toContain('outside your own normal');
    expect(finding?.tradeIds).toHaveLength(3);
    expect(finding?.confidence.n).toBe(3);
  });

  it('says nothing when the recent week is inside the trader own normal', () => {
    const trades = build([
      ...day(40, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5]),
      ...day(30, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5]),
      ...day(20, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5]),
      ...day(2, [0.1, 0.1, 0.1]),
    ]);
    const result = computeBaselines(trades, settings, AS_OF);
    expect(result.measurable).toBe(true);
    expect(result.findings).toEqual([]);
    for (const metric of result.metrics) expect(metric.outsideNormal).toBe(false);
  });

  it('flags trades per day against the trader own p90 of active days', () => {
    // Baseline: three days of 7 trades and three of 1 — p90 of [1,1,1,7,7,7]
    // is 7. The recent week runs 9 a day, which is outside it.
    const trades = build([
      ...day(40, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(39, [0.1]),
      ...day(30, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(29, [0.1]),
      ...day(20, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(19, [0.1]),
      ...day(2, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
    ]);
    const result = computeBaselines(trades, settings, AS_OF);
    const perDay = result.metrics.find((metric) => metric.key === 'tradesPerDay');
    expect(perDay?.p90).toBe(7);
    expect(perDay?.recentMedian).toBe(9);
    expect(perDay?.outsideNormal).toBe(true);
    expect(perDay?.exceedingTradeIds).toHaveLength(9);
  });

  it('never touches the score: these are findings only', () => {
    const trades = build([
      ...day(40, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(30, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(20, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
      ...day(2, [0.8, 0.8, 0.8]),
    ]);
    const result = computeBaselines(trades, settings, AS_OF);
    expect(result.findings.length).toBeGreaterThan(0);
    // Risk% is unchanged by lot size in these fixtures, so no trade is
    // oversized and nothing a pillar reads has moved.
    for (const trade of trades) expect(trade.oversized).toBe(false);
  });

  it('is deterministic', () => {
    const trades = build([
      ...day(40, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2]),
      ...day(30, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2]),
      ...day(20, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2]),
      ...day(2, [0.8, 0.8, 0.8]),
    ]);
    expect(computeBaselines(trades, settings, AS_OF)).toEqual(
      computeBaselines(trades, settings, AS_OF),
    );
  });
});
