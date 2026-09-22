/**
 * Discipline Replay (CLAUDE.md §6.11).
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades } from './enrich';
import type { TradeSpec } from './fixtures';
import { makeNews, makeTrades } from './fixtures';
import { resolveSettings } from './settings';
import { DAY_OPENING_KARAT, computeReplay, worstTiltEpisode } from './replay';
import { DAY_MS } from './time';

const settings = resolveSettings();
const NEWS = [
  makeNews('2026-03-02T12:30:00Z', 'US CPI', 1),
  makeNews('2026-03-02T13:30:00Z', 'US Retail Sales', 2),
];

function build(specs: readonly TradeSpec[], calendar = NEWS) {
  return enrichTrades(
    { trades: makeTrades(specs.slice()), modifications: [], calendar },
    settings,
  );
}

describe('computeReplay', () => {
  it('walks a day in order, re-scoring after every trade', () => {
    const trades = build(
      [
        { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
        { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
        { openTime: '2026-03-02T15:00:00Z', netProfit: 100 },
      ],
      NEWS,
    );
    const [day] = computeReplay(trades, settings);
    expect(day?.date).toBe('2026-03-02');
    expect(day?.trades.map((trade) => trade.index)).toEqual([1, 2, 3]);

    // A clean first trade leaves the day where it opened.
    expect(day?.trades[0]?.karatBefore).toBe(DAY_OPENING_KARAT);
    expect(day?.trades[0]?.karatAfter).toBe(DAY_OPENING_KARAT);
    // The news entry costs the day some Karat, and the running score carries.
    expect(day?.trades[1]?.karatAfter).toBeLessThan(DAY_OPENING_KARAT);
    expect(day?.trades[1]?.karatChange).toBeLessThan(0);
    expect(day?.trades[2]?.karatBefore).toBe(day?.trades[1]?.karatAfter);
    // The day's own Karat is where the walk ends.
    expect(day?.karat).toBe(day?.trades[2]?.karatAfter);
  });

  it('names every impurity with its reason', () => {
    const trades = build([
      { openTime: '2026-03-02T12:28:00Z', netProfit: -300, slDistance: 30 },
    ]);
    const [day] = computeReplay(trades, settings);
    const kinds = day?.trades[0]?.impurities.map((impurity) => impurity.kind);
    expect(kinds).toContain('news');
    expect(kinds).toContain('oversized');
    for (const impurity of day?.trades[0]?.impurities ?? []) {
      expect(impurity.reason.length).toBeGreaterThan(0);
    }
  });

  it('carries the Gap attribution for each trade', () => {
    const trades = build([{ openTime: '2026-03-02T12:28:00Z', netProfit: -200 }]);
    const [day] = computeReplay(trades, settings);
    expect(day?.trades[0]?.costPillar).toBe('market');
    expect(day?.trades[0]?.costMoney).toBe(200);
  });

  it('splits days at UTC midnight', () => {
    const trades = build([
      { openTime: '2026-03-02T23:50:00Z', netProfit: -100 },
      { openTime: '2026-03-03T00:05:00Z', netProfit: -100 },
    ]);
    const days = computeReplay(trades, settings);
    expect(days.map((day) => day.date)).toEqual(['2026-03-02', '2026-03-03']);
    expect(days[1]?.trades[0]?.karatBefore).toBe(DAY_OPENING_KARAT);
  });

  it('honours a date range', () => {
    const trades = build([
      { openTime: '2026-03-02T08:00:00Z' },
      { openTime: '2026-03-09T08:00:00Z' },
    ]);
    const days = computeReplay(trades, settings, {
      fromMs: Date.parse('2026-03-05T00:00:00Z'),
    });
    expect(days.map((day) => day.date)).toEqual(['2026-03-09']);
  });

  it('ignores EA trades', () => {
    const trades = build([
      { openTime: '2026-03-02T12:28:00Z', netProfit: -100, magic: 1001 },
      { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
    ]);
    const [day] = computeReplay(trades, settings);
    expect(day?.tradeCount).toBe(1);
  });
});

describe('tilt episodes', () => {
  it('finds two impurities inside the window', () => {
    const trades = build([
      { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
      { openTime: '2026-03-02T13:25:00Z', netProfit: -100 },
    ]);
    const [day] = computeReplay(trades, settings);
    expect(day?.episodes).toHaveLength(1);
    const episode = day?.episodes[0];
    expect(episode?.impurityTradeCount).toBe(2);
    expect(episode?.start).toBe('2026-03-02T12:28:00.000Z');
    expect(episode?.end).toBe('2026-03-02T13:25:00.000Z');
    expect(episode?.durationMinutes).toBe(57);
    expect(episode?.karatDrop).toBeGreaterThan(0);
    expect(episode?.costMoney).toBe(200);
    expect(episode?.netProfit).toBe(-200);
  });

  it('does not make an episode out of a single impurity', () => {
    const trades = build([
      { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
      { openTime: '2026-03-02T16:00:00Z', netProfit: 100 },
    ]);
    const [day] = computeReplay(trades, settings);
    expect(day?.episodes).toEqual([]);
  });

  it('does not chain impurities more than the window apart', () => {
    // 12:28 and 13:30 are 62 minutes apart — past the 60-minute window.
    const trades = build(
      [
        { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
        { openTime: '2026-03-02T13:30:00Z', netProfit: -100 },
      ],
      [makeNews('2026-03-02T12:30:00Z', 'US CPI', 1), makeNews('2026-03-02T13:31:00Z', 'US PPI', 2)],
    );
    const [day] = computeReplay(trades, settings);
    expect(day?.episodes).toEqual([]);
  });

  it('chains a run longer than the window, trade by trade', () => {
    // 12:28 → 13:25 → 14:20: each step is inside 60 minutes, so it is one
    // episode of three even though the ends are 112 minutes apart.
    const trades = build(
      [
        { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
        { openTime: '2026-03-02T13:25:00Z', netProfit: -100 },
        { openTime: '2026-03-02T14:20:00Z', netProfit: -100 },
      ],
      [
        makeNews('2026-03-02T12:30:00Z', 'US CPI', 1),
        makeNews('2026-03-02T13:30:00Z', 'US Retail Sales', 2),
        makeNews('2026-03-02T14:25:00Z', 'US Claims', 3),
      ],
    );
    const [day] = computeReplay(trades, settings);
    expect(day?.episodes).toHaveLength(1);
    expect(day?.episodes[0]?.impurityTradeCount).toBe(3);
    expect(day?.episodes[0]?.durationMinutes).toBe(112);
  });

  it('starts a new episode after a clean stretch', () => {
    const trades = build(
      [
        { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
        { openTime: '2026-03-02T12:40:00Z', netProfit: -100 },
        // Four hours later, a second pair.
        { openTime: '2026-03-02T16:28:00Z', netProfit: -100, slDistance: 30 },
        { openTime: '2026-03-02T16:40:00Z', netProfit: -100, slDistance: 30 },
      ],
      [makeNews('2026-03-02T12:34:00Z', 'US CPI', 1)],
    );
    const [day] = computeReplay(trades, settings);
    expect(day?.episodes).toHaveLength(2);
    expect(day?.episodes[1]?.start).toBe('2026-03-02T16:28:00.000Z');
  });

  it('measures the drop from before the episode to after it', () => {
    const trades = build([
      { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
      { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
      { openTime: '2026-03-02T13:25:00Z', netProfit: -100 },
    ]);
    const [day] = computeReplay(trades, settings);
    const episode = day?.episodes[0];
    expect(episode?.karatBefore).toBe(day?.trades[0]?.karatAfter);
    expect(episode?.karatAfter).toBe(day?.trades[2]?.karatAfter);
    expect(episode?.karatDrop).toBeCloseTo(
      (episode?.karatBefore ?? 0) - (episode?.karatAfter ?? 0),
      6,
    );
  });

  it('picks the worst episode across days', () => {
    const specs: TradeSpec[] = [];
    const base = Date.parse('2026-03-02T00:00:00Z');
    for (let day = 0; day < 2; day += 1) {
      const count = day === 0 ? 2 : 5;
      for (let index = 0; index < count; index += 1) {
        specs.push({
          openTime: new Date(base + day * DAY_MS + 12 * 3_600_000 + index * 600_000).toISOString(),
          netProfit: -100,
          slDistance: 30,
        });
      }
    }
    const days = computeReplay(build(specs, []), settings);
    const worst = worstTiltEpisode(days);
    expect(worst?.date).toBe('2026-03-03');
    expect(worst?.episode.impurityTradeCount).toBe(5);
  });

  it('finds nothing in a clean set of days', () => {
    const trades = build([
      { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
      { openTime: '2026-03-03T08:00:00Z', netProfit: 100 },
    ]);
    expect(worstTiltEpisode(computeReplay(trades, settings))).toBeNull();
  });

  it('is deterministic', () => {
    const trades = build([
      { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
      { openTime: '2026-03-02T13:25:00Z', netProfit: -100 },
    ]);
    expect(computeReplay(trades, settings)).toEqual(computeReplay(trades, settings));
  });
});
