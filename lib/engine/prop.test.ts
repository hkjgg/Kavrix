/**
 * The prop-firm check (CLAUDE.md §6.12).
 *
 * Every fixture starts from $10,000 of equity, so a 5% daily rule is a $500
 * day and a 10% drawdown rule is $1,000 from the high-water mark — all of it
 * checkable by hand.
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades } from './enrich';
import type { TradeSpec } from './fixtures';
import { makeNews, makeTrades } from './fixtures';
import { DEFAULT_PROP_RULES, PROP_DISCLAIMER, breachCost, computePropCheck } from './prop';
import { resolveSettings } from './settings';
import { DAY_MS } from './time';

const settings = resolveSettings();
const START = Date.parse('2026-03-02T00:00:00.000Z');

function at(dayOffset: number, hour: number, minute = 0): string {
  return new Date(
    START + dayOffset * DAY_MS + hour * 3_600_000 + minute * 60_000,
  ).toISOString();
}

function build(specs: readonly TradeSpec[], calendar = [] as ReturnType<typeof makeNews>[]) {
  return enrichTrades(
    { trades: makeTrades(specs.slice()), modifications: [], calendar },
    settings,
  );
}

describe('DEFAULT_PROP_RULES', () => {
  it('is generic and names no firm', () => {
    expect(DEFAULT_PROP_RULES.dailyLossPercent).toBe(5);
    expect(DEFAULT_PROP_RULES.maxDrawdownPercent).toBe(10);
    expect(DEFAULT_PROP_RULES.label).toBe('Generic preset');
  });

  it('says out loud that it is historical', () => {
    expect(PROP_DISCLAIMER).toContain('Historical only');
    expect(PROP_DISCLAIMER).toContain('not a prediction');
  });
});

describe('computePropCheck', () => {
  it('finds no breach in a quiet history', () => {
    const result = computePropCheck(
      build([
        { openTime: at(0, 8), netProfit: -100 },
        { openTime: at(1, 8), netProfit: 200 },
      ]),
      settings,
    );
    expect(result.breachDayCount).toBe(0);
    expect(result.firstBreachDate).toBeNull();
    expect(result.firstBreachRule).toBeNull();
  });

  it('breaches the daily rule at exactly the limit, not a cent before', () => {
    // $10,000 opening equity: −$499 is 4.99%, −$500 is exactly 5%.
    const under = computePropCheck(
      build([{ openTime: at(0, 8), netProfit: -499 }]),
      settings,
    );
    expect(under.breachDayCount).toBe(0);

    const at5 = computePropCheck(
      build([{ openTime: at(0, 8), netProfit: -500 }]),
      settings,
    );
    expect(at5.breachDayCount).toBe(1);
    expect(at5.days[0]?.dayLossPercent).toBe(5);
    expect(at5.firstBreachRule).toBe('daily-loss');
  });

  it('measures the daily loss against the equity the day opened with', () => {
    const result = computePropCheck(
      build([
        // Day one ends $2,000 up: equity opens day two at $12,000.
        { openTime: at(0, 8), netProfit: 2_000 },
        // −$550 is 4.58% of $12,000 — under the rule, though it would have
        // breached on the opening balance.
        { openTime: at(1, 8), netProfit: -550 },
      ]),
      settings,
    );
    expect(result.days[1]?.startEquity).toBe(12_000);
    expect(result.days[1]?.dayLossPercent).toBeCloseTo(4.58, 2);
    expect(result.breachDayCount).toBe(0);
  });

  it('resets the daily rule every morning', () => {
    const result = computePropCheck(
      build([
        { openTime: at(0, 8), netProfit: -600 },
        { openTime: at(1, 8), netProfit: -600 },
        { openTime: at(2, 8), netProfit: 100 },
      ]),
      settings,
    );
    expect(result.dailyLossBreachCount).toBe(2);
    expect(result.breachDays.map((day) => day.date)).toEqual([
      '2026-03-02',
      '2026-03-03',
    ]);
  });

  it('treats the overall drawdown rule as terminal', () => {
    // A steady slide well past 10% from the high-water mark: the rule is
    // crossed once and the account is over, not once a day forever.
    const specs: TradeSpec[] = [];
    for (let day = 0; day < 10; day += 1) {
      specs.push({ openTime: at(day, 8), netProfit: -300 });
    }
    const result = computePropCheck(build(specs), settings);
    expect(result.drawdownBreachCount).toBe(1);
    // −$300 a day from $10,000: the fourth day passes −$1,000.
    expect(result.drawdownBreachDate).toBe('2026-03-05');
    expect(result.worstDrawdownPercent).toBeCloseTo(30, 2);
  });

  it('measures the drawdown from the high-water mark, not the start', () => {
    const result = computePropCheck(
      build([
        { openTime: at(0, 8), netProfit: 5_000 },
        // $15,000 high-water mark; −$1,400 is 9.33%, still inside the rule.
        { openTime: at(1, 8), netProfit: -1_400 },
      ]),
      settings,
    );
    expect(result.worstDrawdownPercent).toBeCloseTo(9.33, 2);
    expect(result.drawdownBreachCount).toBe(0);
  });

  it('names the first breach, whichever rule it was', () => {
    const result = computePropCheck(
      build([
        { openTime: at(0, 8), netProfit: -700 },
        { openTime: at(1, 8), netProfit: -700 },
      ]),
      settings,
    );
    expect(result.firstBreachDate).toBe('2026-03-02');
    expect(result.firstBreachRule).toBe('daily-loss');
  });

  it('takes a user preset', () => {
    const result = computePropCheck(
      build([{ openTime: at(0, 8), netProfit: -250 }]),
      settings,
      { label: 'Tighter', dailyLossPercent: 2, maxDrawdownPercent: 4 },
    );
    expect(result.rules.label).toBe('Tighter');
    expect(result.breachDayCount).toBe(1);
  });

  it('attributes a breach day to the pillar that carried the most cost', () => {
    const result = computePropCheck(
      build(
        [
          // A news-window loser: Market Conditions bills the whole $400.
          { openTime: at(0, 12, 28), netProfit: -400 },
          // A clean, oversized loser: Risk bills only the extra size.
          { openTime: at(0, 16), netProfit: -300, slDistance: 30 },
        ],
        [makeNews(at(0, 12, 30))],
      ),
      settings,
    );
    expect(result.breachDayCount).toBe(1);
    expect(result.breachDays[0]?.worstPillar).toBe('market');
    expect(result.pillarTally[0]).toMatchObject({ pillar: 'market', days: 1 });
    expect(result.worstPillar).toBe('market');
  });

  it('counts EA trades in the equity walk but never in the attribution', () => {
    const result = computePropCheck(
      build([{ openTime: at(0, 8), netProfit: -600, magic: 1001 }]),
      settings,
    );
    expect(result.breachDayCount).toBe(1);
    expect(result.breachDays[0]?.impurityTradeCount).toBe(0);
    expect(result.breachDays[0]?.worstPillar).toBeNull();
    expect(result.pillarTally).toEqual([]);
  });

  it('adds up what the breach days cost', () => {
    const result = computePropCheck(
      build([
        { openTime: at(0, 8), netProfit: -600 },
        { openTime: at(1, 8), netProfit: 100 },
        { openTime: at(2, 8), netProfit: -700 },
      ]),
      settings,
    );
    expect(breachCost(result)).toBe(-1_300);
  });

  it('survives an empty account', () => {
    const result = computePropCheck([], settings);
    expect(result).toMatchObject({
      activeDays: 0,
      breachDayCount: 0,
      firstBreachDate: null,
      worstPillar: null,
    });
  });

  it('is deterministic', () => {
    const trades = build([
      { openTime: at(0, 8), netProfit: -600 },
      { openTime: at(1, 8), netProfit: -600 },
    ]);
    expect(computePropCheck(trades, settings)).toEqual(
      computePropCheck(trades, settings),
    );
  });
});
