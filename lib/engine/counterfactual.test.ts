/**
 * The What-if (CLAUDE.md §6.10).
 *
 * The arithmetic is deliberately trivial — the point of these tests is that
 * the removal is honest: winners go too, the method stays linear, and the
 * number never quietly becomes the Karat Gap.
 */

import { describe, expect, it } from 'vitest';
import {
  COUNTERFACTUAL_LABEL,
  computeCounterfactual,
  scenarioRemoves,
} from './counterfactual';
import { enrichTrades } from './enrich';
import type { TradeSpec } from './fixtures';
import { makeNews, makeTrades } from './fixtures';
import { computeKaratGap } from './gap';
import { resolveSettings } from './settings';

const settings = resolveSettings();
const NEWS_TIME = '2026-03-02T12:30:00Z';

function build(specs: readonly TradeSpec[], withNews = true) {
  return enrichTrades(
    {
      trades: makeTrades(specs.slice()),
      modifications: [],
      calendar: withNews ? [makeNews(NEWS_TIME)] : [],
    },
    settings,
  );
}

describe('scenarioRemoves', () => {
  it('removes an EA trade from nothing', () => {
    const trades = build([
      { openTime: '2026-03-02T12:28:00Z', netProfit: -100, magic: 1001 },
    ]);
    expect(scenarioRemoves(trades[0]!, 'all')).toBe(false);
    expect(scenarioRemoves(trades[0]!, 'market')).toBe(false);
  });

  it('puts one trade in every toggle whose impurity it carries', () => {
    // A news-window entry at 3% risk: both the market and the risk toggle.
    const trades = build([
      { openTime: '2026-03-02T12:28:00Z', netProfit: -300, slDistance: 30 },
    ]);
    const trade = trades[0]!;
    expect(scenarioRemoves(trade, 'market')).toBe(true);
    expect(scenarioRemoves(trade, 'risk')).toBe(true);
    expect(scenarioRemoves(trade, 'revenge')).toBe(false);
    expect(scenarioRemoves(trade, 'all')).toBe(true);
  });
});

describe('computeCounterfactual', () => {
  const specs: TradeSpec[] = [
    // Clean winner.
    { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
    // Impurity that lost: in the news window.
    { openTime: '2026-03-02T12:28:00Z', netProfit: -200 },
    // Impurity that WON: also in the news window.
    { openTime: '2026-03-02T12:35:00Z', netProfit: 400 },
    // Clean loser.
    { openTime: '2026-03-03T08:00:00Z', netProfit: -50 },
  ];

  it('carries the label and the method, always', () => {
    const result = computeCounterfactual(build(specs), settings);
    expect(result.label).toBe(COUNTERFACTUAL_LABEL);
    expect(result.method).toContain('no re-sizing');
  });

  it('removes winners as well as losers', () => {
    const result = computeCounterfactual(build(specs), settings);
    const all = result.scenarios.find((scenario) => scenario.key === 'all');
    expect(all?.removedTradeCount).toBe(2);
    expect(all?.removedWins).toBe(1);
    expect(all?.removedLosses).toBe(1);
  });

  it('subtracts exactly the removed trades P&L, and nothing else', () => {
    const result = computeCounterfactual(build(specs), settings);
    // Actual: 100 − 200 + 400 − 50 = +250.
    expect(result.actualEndMoney).toBe(250);
    const all = result.scenarios.find((scenario) => scenario.key === 'all');
    // Removed: −200 + 400 = +200. So the counterfactual ends at 250 − 200 = 50,
    // which is *worse* than the truth — and the engine says so.
    expect(all?.removedMoney).toBe(200);
    expect(all?.endMoney).toBe(50);
    expect(all?.deltaMoney).toBe(-200);
  });

  it('is linear: the curve is the actual curve minus the removed trades', () => {
    const trades = build(specs);
    const result = computeCounterfactual(trades, settings);
    let running = 0;
    for (const point of result.curve) {
      const trade = trades.find((entry) => entry.id === point.tradeId)!;
      if (!scenarioRemoves(trade, 'all')) running += trade.netProfit;
      expect(point.counterfactualMoney).toBeCloseTo(running, 6);
      expect(point.counterfactualEquity).toBeCloseTo(
        result.startingEquity + running,
        6,
      );
    }
  });

  it('holds one point per trade, in close order', () => {
    const trades = build(specs);
    const result = computeCounterfactual(trades, settings);
    expect(result.curve).toHaveLength(trades.length);
    for (let i = 1; i < result.curve.length; i += 1) {
      expect(Date.parse(result.curve[i]!.time)).toBeGreaterThanOrEqual(
        Date.parse(result.curve[i - 1]!.time),
      );
    }
  });

  it('never matches the Karat Gap, and is never stricter than it', () => {
    const trades = build(specs);
    const result = computeCounterfactual(trades, settings);
    const gap = computeKaratGap(trades, settings);
    const all = result.scenarios.find((scenario) => scenario.key === 'all');

    // The Gap bills the losing news trade only: 200.
    expect(gap.totalCostMoney).toBe(200);
    // The What-if removed the winner too, so the two numbers differ — the Gap
    // is the stricter of the pair, and the curve is the honest one.
    expect(all?.gapCostMoney).toBe(gap.totalCostMoney);
    expect(all?.deltaMoney).not.toBe(gap.totalCostMoney);
  });

  it('gives each pillar toggle its own removal set', () => {
    const trades = build([
      { openTime: '2026-03-02T08:00:00Z', netProfit: -100 },
      // Opened four minutes after that loss closed: revenge.
      { openTime: '2026-03-02T09:04:00Z', netProfit: -100 },
      // In the news window: market conditions.
      { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
    ]);
    const result = computeCounterfactual(trades, settings);
    const revenge = result.scenarios.find((scenario) => scenario.key === 'revenge');
    const market = result.scenarios.find((scenario) => scenario.key === 'market');
    expect(revenge?.removedTradeCount).toBe(1);
    expect(market?.removedTradeCount).toBe(1);
    expect(revenge?.deltaMoney).toBe(100);
    expect(market?.deltaMoney).toBe(100);
  });

  it('leaves EA trades in the curve', () => {
    const trades = build([
      { openTime: '2026-03-02T12:28:00Z', netProfit: -500, magic: 1001 },
      { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
    ]);
    const result = computeCounterfactual(trades, settings);
    const all = result.scenarios.find((scenario) => scenario.key === 'all');
    expect(all?.removedTradeCount).toBe(0);
    expect(result.actualEndMoney).toBe(-400);
    expect(all?.endMoney).toBe(-400);
  });

  it('survives an empty account', () => {
    const result = computeCounterfactual([], settings);
    expect(result.curve).toEqual([]);
    expect(result.actualEndMoney).toBe(0);
    for (const scenario of result.scenarios) expect(scenario.deltaMoney).toBe(0);
  });

  it('is deterministic', () => {
    const trades = build(specs);
    expect(computeCounterfactual(trades, settings)).toEqual(
      computeCounterfactual(trades, settings),
    );
  });
});
