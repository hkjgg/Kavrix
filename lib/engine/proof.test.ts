/**
 * Your Proof tests (CLAUDE.md §6.4).
 *
 * The fixtures are two kinds of week, built to be unarguable:
 *
 *  - a disciplined week — five clean 1R winners, one a day, which scores 24K;
 *  - an impure week — six trades in one day, each without a stop, each inside
 *    a news window, each losing 2R, which scores 5.9K.
 *
 * So the high bucket averages +5R a week, the low bucket −12R, and the card
 * should read "discipline paid you 17R a week".
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades } from './enrich';
import type { EnrichedTrade } from './enrich';
import { computeProof } from './proof';
import { DEFAULT_SETTINGS, resolveSettings } from './settings';
import { isoWeekKey, toMs } from './time';
import { makeTrades } from './fixtures';
import type { TradeSpec } from './fixtures';
import type { NewsEvent } from './types';

/** Five clean winners, Monday to Friday, one a day. +5R, 24K. */
function disciplinedWeek(monday: string, count = 5): TradeSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    openTime: `${addDays(monday, index)}T09:00:00Z`,
    durationMinutes: 45,
    netProfit: 100,
  }));
}

/** Six no-stop 2R losses in one day, each on a release. −12R, 5.9K. */
function impureWeek(monday: string): TradeSpec[] {
  return Array.from({ length: 6 }, (_, index) => ({
    openTime: `${monday}T${String(8 + index * 2).padStart(2, '0')}:00:00Z`,
    durationMinutes: 45,
    slDistance: null,
    netProfit: -200,
  }));
}

function impureWeekNews(monday: string, startId: number): NewsEvent[] {
  return Array.from({ length: 6 }, (_, index) => ({
    eventId: startId + index,
    time: `${monday}T${String(8 + index * 2).padStart(2, '0')}:00:00Z`,
    currency: 'USD',
    importance: 'high' as const,
    name: 'US CPI',
  }));
}

function addDays(date: string, days: number): string {
  return new Date(toMs(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function enrich(specs: readonly TradeSpec[], calendar: NewsEvent[]): EnrichedTrade[] {
  return enrichTrades({ trades: makeTrades(specs), modifications: [], calendar }, DEFAULT_SETTINGS);
}

const HIGH_MONDAYS = ['2026-06-01', '2026-06-08', '2026-06-15'];
const LOW_MONDAYS = ['2026-06-22', '2026-06-29', '2026-07-06'];

function build(highs: readonly string[], lows: readonly string[]): EnrichedTrade[] {
  const specs = [
    ...highs.flatMap((monday) => disciplinedWeek(monday)),
    ...lows.flatMap((monday) => impureWeek(monday)),
  ];
  const calendar = lows.flatMap((monday, index) => impureWeekNews(monday, 100 + index * 10));
  return enrich(specs, calendar);
}

describe('weekly scoring (§6.4)', () => {
  it('scores each week unweighted, on its own trades', () => {
    const proof = computeProof(build(HIGH_MONDAYS, LOW_MONDAYS), DEFAULT_SETTINGS);
    expect(proof.weeks).toHaveLength(6);

    const first = proof.weeks[0];
    expect(first?.isoWeek).toBe(isoWeekKey(toMs('2026-06-01T00:00:00Z')));
    expect(first?.karat).toBe(24);
    expect(first?.netR).toBe(5);
    expect(first?.bucket).toBe('high');

    const last = proof.weeks[5];
    expect(last?.karat).toBe(5.9);
    expect(last?.netR).toBe(-12);
    expect(last?.bucket).toBe('low');
  });

  it('ignores weeks under five trades', () => {
    const trades = enrich(
      [...HIGH_MONDAYS.flatMap((monday) => disciplinedWeek(monday)), ...disciplinedWeek('2026-07-13', 4)],
      [],
    );
    const proof = computeProof(trades, DEFAULT_SETTINGS);
    expect(proof.weeks).toHaveLength(3);
    expect(proof.weeks.map((week) => week.isoWeek)).not.toContain(
      isoWeekKey(toMs('2026-07-13T00:00:00Z')),
    );
  });
});

describe('the buckets (§6.4)', () => {
  it('reports the average weekly R on each side, and the difference', () => {
    const proof = computeProof(build(HIGH_MONDAYS, LOW_MONDAYS), DEFAULT_SETTINGS);
    expect(proof.visible).toBe(true);
    expect(proof.high.weekCount).toBe(3);
    expect(proof.high.avgWeeklyR).toBe(5);
    expect(proof.low.weekCount).toBe(3);
    expect(proof.low.avgWeeklyR).toBe(-12);
    expect(proof.differenceR).toBe(17);
  });

  it('leaves the middle out of both buckets', () => {
    // A week of five clean trades where two entered on a release scores 16.8K:
    // between 14K and 20K, so it belongs to neither side.
    const middle = computeProof(
      enrich(
        [
          ...disciplinedWeek('2026-06-01'),
          ...disciplinedWeek('2026-06-08').map((spec, index) =>
            index < 2 ? { ...spec, netProfit: -200, slDistance: null } : spec,
          ),
        ],
        [],
      ),
      DEFAULT_SETTINGS,
    );
    const week = middle.weeks[1];
    expect(week?.bucket).toBe('middle');
    expect(week?.karat).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.proofLowKarat);
    expect(week?.karat).toBeLessThan(DEFAULT_SETTINGS.proofHighKarat);
  });
});

describe('the hiding rule (§6.4)', () => {
  it('hides the card until each bucket holds three weeks', () => {
    const proof = computeProof(build(HIGH_MONDAYS, LOW_MONDAYS.slice(0, 2)), DEFAULT_SETTINGS);
    expect(proof.visible).toBe(false);
    expect(proof.differenceR).toBe(0);
    expect(proof.hiddenReason).toBe(
      'Needs 3 weeks in each bucket · 3 disciplined, 2 impure',
    );
  });

  it('respects a changed threshold', () => {
    const settings = resolveSettings({ proofMinWeeksPerBucket: 2 });
    const proof = computeProof(build(HIGH_MONDAYS, LOW_MONDAYS.slice(0, 2)), settings);
    expect(proof.visible).toBe(true);
    expect(proof.differenceR).toBe(17);
  });
});
