/**
 * Refinery tests (CLAUDE.md §10, §2).
 *
 * Findings are engine output, not model output: the same data must always
 * produce the same headlines in the same order, and every number in a headline
 * has to come from the trades behind it.
 */

import { describe, expect, it } from 'vitest';
import { computeConstellation } from './ea';
import { enrichTrades } from './enrich';
import type { EnrichedTrade } from './enrich';
import { computeFindings } from './findings';
import type { Finding } from './findings';
import { computeKaratGap } from './gap';
import { DEFAULT_SETTINGS } from './settings';
import { makeNews, makeTrades } from './fixtures';
import type { TradeSpec } from './fixtures';
import type { NewsEvent } from './types';

/** A small account that breaks one rule of each kind. */
function account(): { trades: EnrichedTrade[] } {
  const specs: TradeSpec[] = [
    // Twelve clean winners at 08:00 — the edge to protect.
    ...Array.from({ length: 12 }, (_, index) => ({
      openTime: `2026-06-${String(index + 1).padStart(2, '0')}T08:00:00Z`,
      durationMinutes: 30,
      netProfit: 100,
    })),
    // Three losses on a release.
    ...Array.from({ length: 3 }, (_, index) => ({
      openTime: `2026-06-${String(index + 1).padStart(2, '0')}T12:30:00Z`,
      durationMinutes: 30,
      netProfit: -200,
    })),
    // A loss, then a bigger trade four minutes later: revenge.
    { openTime: '2026-06-20T09:00:00Z', durationMinutes: 20, netProfit: -100 },
    { openTime: '2026-06-20T09:24:00Z', durationMinutes: 20, volume: 0.3, netProfit: -300 },
    // A rollover entry.
    { openTime: '2026-06-21T23:50:00Z', durationMinutes: 30, netProfit: -150 },
    // Six trades in one day.
    ...Array.from({ length: 6 }, (_, index) => ({
      openTime: `2026-06-25T${String(9 + index).padStart(2, '0')}:00:00Z`,
      durationMinutes: 30,
      netProfit: -60,
    })),
  ];

  const calendar: NewsEvent[] = Array.from({ length: 3 }, (_, index) =>
    makeNews(`2026-06-0${index + 1}T12:30:00Z`, 'US CPI', index + 1),
  );

  return {
    trades: enrichTrades({ trades: makeTrades(specs), modifications: [], calendar }, DEFAULT_SETTINGS),
  };
}

function findings(): Finding[] {
  const { trades } = account();
  const gap = computeKaratGap(trades, DEFAULT_SETTINGS);
  return computeFindings({
    trades,
    gap,
    constellation: computeConstellation(trades, [], DEFAULT_SETTINGS),
    settings: DEFAULT_SETTINGS,
  });
}

describe('what the Refinery finds', () => {
  const results = findings();
  const byKind = new Map(results.map((finding) => [finding.kind, finding]));

  it('reports every kind the data contains', () => {
    for (const kind of [
      'news-window-losses',
      'revenge-cost',
      'best-window',
      'worst-weekday',
      'overtrading-days',
      'rollover-entries',
    ] as const) {
      expect(byKind.has(kind)).toBe(true);
    }
  });

  it('counts the news-window trades and their money', () => {
    const finding = byKind.get('news-window-losses');
    expect(finding?.metrics.trades).toBe(3);
    expect(finding?.metrics.losses).toBe(3);
    expect(finding?.impactMoney).toBe(-600);
    expect(finding?.tradeIds).toHaveLength(3);
    expect(finding?.headline).toContain('3 trades opened within 15 min');
  });

  it('bills revenge from the Gap, not from the raw P&L', () => {
    const finding = byKind.get('revenge-cost');
    expect(finding?.metrics.trades).toBe(1);
    expect(finding?.impactMoney).toBe(-300);
    expect(finding?.headline).toContain('1 revenge trades cost −$300.00');
  });

  it('names the window worth protecting', () => {
    const finding = byKind.get('best-window');
    expect(finding?.severity).toBe('strength');
    expect(finding?.impactMoney).toBe(1200);
    expect(finding?.metrics.trades).toBe(12);
    expect(finding?.tradeIds).toHaveLength(12);
  });

  it('counts overtrading in days', () => {
    const finding = byKind.get('overtrading-days');
    expect(finding?.metrics.days).toBe(1);
    expect(finding?.metrics.trades).toBe(6);
    expect(finding?.impactMoney).toBe(-360);
  });

  it('names the rollover entry', () => {
    const finding = byKind.get('rollover-entries');
    expect(finding?.metrics.trades).toBe(1);
    expect(finding?.impactMoney).toBe(-150);
  });
});

describe('ranking', () => {
  const results = findings();

  it('ranks by money at stake, costs and edges alike', () => {
    const impacts = results.map((finding) => Math.abs(finding.impactMoney));
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
    expect(results.map((finding) => finding.rank)).toEqual(
      results.map((_, index) => index + 1),
    );
  });

  it('is deterministic', () => {
    expect(findings()).toEqual(results);
  });

  it('gives every finding an id, a headline and real trade ids', () => {
    const ids = new Set(account().trades.map((trade) => trade.id));
    for (const finding of results) {
      expect(finding.id).not.toBe('');
      expect(finding.headline.length).toBeGreaterThan(20);
      expect(finding.headline.endsWith('.')).toBe(true);
      for (const tradeId of finding.tradeIds) expect(ids.has(tradeId)).toBe(true);
    }
  });

  it('scales severity against the size of the Gap', () => {
    const severities = new Set(results.map((finding) => finding.severity));
    expect(severities.has('critical')).toBe(true);
    expect(severities.has('strength')).toBe(true);
  });
});
