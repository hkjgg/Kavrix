/**
 * Karat Gap tests (CLAUDE.md §6.3).
 *
 * The rule under test is single attribution: a trade that breaks four rules
 * still appears on exactly one line, chosen in the order
 * Revenge → Market Conditions → Risk → Exits, so the total is a bill that adds
 * up rather than a tally of violations.
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades } from './enrich';
import type { EnrichedTrade } from './enrich';
import { attributeCost, computeKaratGap } from './gap';
import { DEFAULT_SETTINGS } from './settings';
import { makeNews, makeTrades } from './fixtures';
import type { TradeSpec } from './fixtures';
import type { NewsEvent } from './types';

function enrich(specs: readonly TradeSpec[], calendar: NewsEvent[] = []): EnrichedTrade[] {
  return enrichTrades(
    { trades: makeTrades(specs), modifications: [], calendar },
    DEFAULT_SETTINGS,
  );
}

function trade(specs: readonly TradeSpec[], id: string, calendar: NewsEvent[] = []): EnrichedTrade {
  const found = enrich(specs, calendar).find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no trade ${id}`);
  return found;
}

describe('attribution priority (§6.3)', () => {
  it('bills a revenge trade once, even when it broke every other rule too', () => {
    const specs: TradeSpec[] = [
      { openTime: '2026-06-01T12:00:00Z', durationMinutes: 20, netProfit: -50 },
      {
        // Revenge (10 min after the loss), in a news window, 2% risk, −1.5R.
        openTime: '2026-06-01T12:30:00Z',
        slDistance: 20,
        netProfit: -300,
      },
    ];
    const calendar = [makeNews('2026-06-01T12:30:00Z')];
    const second = trade(specs, 't2', calendar);

    expect(second.impurities).toContain('revenge');
    expect(second.impurities).toContain('news');
    expect(second.impurities).toContain('oversized');
    expect(second.impurities).toContain('exitOverrun');

    const gap = computeKaratGap(enrich(specs, calendar), DEFAULT_SETTINGS);
    expect(gap.lines).toHaveLength(1);
    expect(gap.lines[0]?.pillar).toBe('revenge');
    // The whole net loss, once. −$300 on $200 of risk is −1.5R.
    expect(gap.lines[0]?.costMoney).toBe(300);
    expect(gap.lines[0]?.costR).toBe(1.5);
    expect(gap.totalCostMoney).toBe(300);
  });

  it('bills a news-window loss to Market Conditions', () => {
    const specs: TradeSpec[] = [{ openTime: '2026-06-01T12:30:00Z', netProfit: -120 }];
    const gap = computeKaratGap(
      enrich(specs, [makeNews('2026-06-01T12:30:00Z')]),
      DEFAULT_SETTINGS,
    );
    expect(gap.lines[0]?.pillar).toBe('market');
    expect(gap.lines[0]?.costMoney).toBe(120);
    expect(gap.lines[0]?.costR).toBe(1.2);
  });

  it('bills oversizing only for the part oversizing added', () => {
    // 2% risk against a 1% limit: half the loss was the size, half the trade.
    const gap = computeKaratGap(
      enrich([{ openTime: '2026-06-01T09:00:00Z', slDistance: 20, netProfit: -300 }]),
      DEFAULT_SETTINGS,
    );
    expect(gap.lines[0]?.pillar).toBe('risk');
    expect(gap.lines[0]?.costMoney).toBe(150);
    expect(gap.lines[0]?.costR).toBe(0.75);
  });

  it('bills an overrun exit only for the part beyond −1R', () => {
    const gap = computeKaratGap(
      enrich([{ openTime: '2026-06-01T09:00:00Z', netProfit: -150 }]),
      DEFAULT_SETTINGS,
    );
    expect(gap.lines[0]?.pillar).toBe('exits');
    expect(gap.lines[0]?.costMoney).toBe(50);
    expect(gap.lines[0]?.costR).toBe(0.5);
  });

  it('charges nothing for an impurity that won', () => {
    const specs: TradeSpec[] = [
      { openTime: '2026-06-01T12:00:00Z', durationMinutes: 20, netProfit: -50 },
      { openTime: '2026-06-01T12:30:00Z', netProfit: 400 },
    ];
    const winner = trade(specs, 't2');
    expect(winner.revenge).toBe(true);
    expect(attributeCost(winner, DEFAULT_SETTINGS)).toBeNull();

    const gap = computeKaratGap(enrich(specs), DEFAULT_SETTINGS);
    expect(gap.lines).toHaveLength(0);
    expect(gap.totalCostMoney).toBe(0);
  });

  it('charges nothing for a clean loss inside the plan', () => {
    const gap = computeKaratGap(
      enrich([{ openTime: '2026-06-01T09:00:00Z', netProfit: -80 }]),
      DEFAULT_SETTINGS,
    );
    expect(gap.lines).toHaveLength(0);
    expect(gap.impurityCount).toBe(0);
  });

  it('has no Stops line — a missing stop shows up in Exits (§6.3)', () => {
    const gap = computeKaratGap(
      enrich([{ openTime: '2026-06-01T09:00:00Z', slDistance: null, netProfit: -400 }]),
      DEFAULT_SETTINGS,
    );
    expect(gap.lines.map((line) => line.pillar)).toEqual(['exits']);
    // −$400 against $100 of assumed risk: $300 of it ran past −1R.
    expect(gap.lines[0]?.costMoney).toBe(300);
  });
});

describe('totals', () => {
  it('never counts a dollar twice', () => {
    const specs: TradeSpec[] = [
      { openTime: '2026-06-01T12:00:00Z', durationMinutes: 20, netProfit: -50 },
      { openTime: '2026-06-01T12:30:00Z', netProfit: -300, slDistance: 20 }, // revenge + news
      { openTime: '2026-06-02T09:00:00Z', slDistance: 20, netProfit: -300 }, // risk
      { openTime: '2026-06-03T09:00:00Z', netProfit: -150 }, // exits
      { openTime: '2026-06-04T09:00:00Z', netProfit: 200 }, // clean winner
    ];
    const gap = computeKaratGap(enrich(specs, [makeNews('2026-06-01T12:30:00Z')]), DEFAULT_SETTINGS);

    expect(gap.attributions).toHaveLength(3);
    expect(new Set(gap.attributions.map((item) => item.tradeId)).size).toBe(3);
    // 300 (revenge) + 150 (risk) + 50 (exits)
    expect(gap.totalCostMoney).toBe(500);
    expect(gap.lines.map((line) => line.pillar)).toEqual(['revenge', 'risk', 'exits']);
  });

  it('ignores EA trades — the Gap is a discipline bill (§6)', () => {
    const gap = computeKaratGap(
      enrich([{ openTime: '2026-06-01T09:00:00Z', magic: 1001, netProfit: -900 }]),
      DEFAULT_SETTINGS,
    );
    expect(gap.tradeCount).toBe(0);
    expect(gap.totalCostMoney).toBe(0);
  });
});
