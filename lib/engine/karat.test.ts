/**
 * Karat Score tests (CLAUDE.md §6).
 *
 * Each pillar is checked against a hand-worked number, then the edges: the
 * risk curve at 1× and 1.5× the limit, both revenge triggers, a widened stop,
 * an overrun exit, holding asymmetry, an overtrading day, the recency weights
 * and every tier boundary.
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades } from './enrich';
import type { EnrichedTrade } from './enrich';
import {
  computeKarat,
  karatFromPoints,
  pointsFromPillars,
  scorePillars,
  tierFor,
} from './karat';
import type { PillarKey, PillarResult } from './karat';
import { DEFAULT_SETTINGS } from './settings';
import { toMs } from './time';
import { makeModification, makeNews, makeTrade, makeTrades } from './fixtures';
import type { TradeSpec } from './fixtures';
import type { NewsEvent, SlModification, Trade } from './types';

function enrich(
  trades: readonly Trade[],
  extras: { modifications?: SlModification[]; calendar?: NewsEvent[] } = {},
): EnrichedTrade[] {
  return enrichTrades(
    {
      trades,
      modifications: extras.modifications ?? [],
      calendar: extras.calendar ?? [],
    },
    DEFAULT_SETTINGS,
  );
}

function pillar(
  key: PillarKey,
  specs: readonly TradeSpec[],
  extras?: { modifications?: SlModification[]; calendar?: NewsEvent[] },
): PillarResult {
  const pillars = scorePillars(enrich(makeTrades(specs), extras), DEFAULT_SETTINGS);
  const found = pillars.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`no ${key} pillar`);
  return found;
}

/** A clean trade every hour, far from news, so a pillar under test sits alone. */
function cleanDay(count: number, startHour = 8, day = '2026-06-01'): TradeSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    openTime: `${day}T${String(startHour + index).padStart(2, '0')}:00:00Z`,
    durationMinutes: 30,
  }));
}

describe('Risk pillar — 25 points (§6.1)', () => {
  it('awards everything at exactly the 1% limit', () => {
    expect(pillar('risk', cleanDay(3)).points).toBe(25);
  });

  it('awards nothing at 1.5× the limit', () => {
    expect(pillar('risk', cleanDay(3).map((spec) => ({ ...spec, slDistance: 15 }))).points).toBe(0);
  });

  it('is linear in between — 1.25% scores half', () => {
    const result = pillar('risk', cleanDay(2).map((spec) => ({ ...spec, slDistance: 12.5 })));
    expect(result.points).toBe(12.5);
    expect(result.deductions[0]?.reason).toBe('Risk above the 1.0% limit');
    expect(result.deductions[0]?.pointsLost).toBe(12.5);
  });

  it('scores a trade without a stop at zero, under its own reason', () => {
    const result = pillar('risk', [
      ...cleanDay(1),
      { openTime: '2026-06-01T10:00:00Z', slDistance: null },
    ]);
    expect(result.points).toBe(12.5);
    expect(result.deductions).toEqual([
      { reason: 'Opened without a stop', tradeIds: ['t2'], pointsLost: 12.5 },
    ]);
  });
});

describe('Revenge pillar — 20 points (§6.1)', () => {
  it('scores 20 × (1 − revenge ÷ all trades)', () => {
    // t1 loses, t2 opens 10 min later (revenge), t3 and t4 are clean.
    const result = pillar('revenge', [
      { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -100 },
      { openTime: '2026-06-01T08:40:00Z' },
      { openTime: '2026-06-01T12:00:00Z', durationMinutes: 30 },
      { openTime: '2026-06-01T14:00:00Z', durationMinutes: 30 },
    ]);
    expect(result.points).toBe(15);
    expect(result.deductions).toEqual([
      {
        reason: 'Opened within 15 min of a loss',
        tradeIds: ['t2'],
        pointsLost: 5,
      },
    ]);
  });

  it('separates the size trigger from the window trigger', () => {
    const result = pillar('revenge', [
      { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -100 },
      { openTime: '2026-06-01T11:00:00Z', volume: 0.2, durationMinutes: 30 },
      { openTime: '2026-06-01T14:00:00Z', durationMinutes: 30 },
      { openTime: '2026-06-01T16:00:00Z', durationMinutes: 30 },
    ]);
    expect(result.points).toBe(15);
    expect(result.deductions[0]?.reason).toBe(
      'Lot over 1.25× the previous trade after a loss',
    );
  });
});

describe('Stops pillar — 15 points (§6.1)', () => {
  it('scores the compliant ratio', () => {
    const trades = makeTrades([
      ...cleanDay(3),
      { openTime: '2026-06-01T11:00:00Z', slDistance: null },
    ]);
    const widened = trades[0];
    if (widened === undefined) throw new Error('fixture');
    const result = scorePillars(
      enrich(trades, {
        modifications: [makeModification(widened.positionId, '2026-06-01T08:10:00Z', 2380)],
      }),
      DEFAULT_SETTINGS,
    ).find((candidate) => candidate.key === 'stops');

    // 2 of 4 compliant → 7.5, split between the two reasons.
    expect(result?.points).toBe(7.5);
    expect(result?.deductions).toEqual([
      { reason: 'No stop within 60 s of entry', tradeIds: ['t4'], pointsLost: 3.75 },
      { reason: 'Stop moved further from entry', tradeIds: ['t1'], pointsLost: 3.75 },
    ]);
  });
});

describe('Exits pillar — 15 points (§6.1)', () => {
  it('splits 70 / 30 between overruns and holding asymmetry', () => {
    // One loss at −1.5R (overrun), one at −0.5R, one winner. All 30 min long,
    // so the asymmetry component is a clean 1.
    const result = pillar('exits', [
      { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -150 },
      { openTime: '2026-06-01T12:00:00Z', durationMinutes: 30, netProfit: -50 },
      { openTime: '2026-06-01T14:00:00Z', durationMinutes: 30, netProfit: 100 },
    ]);
    // 15 × (0.7 × (1 − 1/2) + 0.3 × 1) = 9.75
    expect(result.points).toBe(9.75);
    expect(result.deductions).toEqual([
      { reason: 'Losses worse than −1.1R', tradeIds: ['t1'], pointsLost: 5.25 },
    ]);
  });

  it('penalises losers held twice as long as winners', () => {
    const result = pillar('exits', [
      { openTime: '2026-06-01T08:00:00Z', durationMinutes: 120, netProfit: -50 },
      { openTime: '2026-06-01T12:00:00Z', durationMinutes: 60, netProfit: 100 },
    ]);
    // ratio 2 → 1 − (2 − 1)/2 = 0.5 → 15 × (0.7 + 0.3 × 0.5) = 12.75
    expect(result.points).toBe(12.75);
    expect(result.deductions).toEqual([
      { reason: 'Losers held longer than winners', tradeIds: ['t1'], pointsLost: 2.25 },
    ]);
  });

  it('gives nothing back once losers run three times as long', () => {
    const result = pillar('exits', [
      { openTime: '2026-06-01T08:00:00Z', durationMinutes: 180, netProfit: -50 },
      { openTime: '2026-06-01T12:00:00Z', durationMinutes: 60, netProfit: 100 },
    ]);
    expect(result.points).toBe(10.5); // 15 × 0.7
  });

  it('is full marks when there is nothing to judge', () => {
    expect(pillar('exits', cleanDay(3)).points).toBe(15);
  });
});

describe('Overtrading pillar — 15 points (§6.1)', () => {
  it('counts days, not trades', () => {
    const result = pillar('overtrading', [
      ...cleanDay(6, 8, '2026-06-01'), // six trades — over the daily max of five
      ...cleanDay(2, 8, '2026-06-02'),
    ]);
    expect(result.points).toBe(7.5); // 1 of 2 active days
    expect(result.deductions[0]?.reason).toBe('More than 5 trades in a day · 1 day');
    expect(result.deductions[0]?.tradeIds).toHaveLength(6);
  });

  it('lets exactly five trades pass', () => {
    expect(pillar('overtrading', cleanDay(5)).points).toBe(15);
  });
});

describe('Market Conditions pillar — 10 points (§6.1)', () => {
  it('scores 10 × (1 − flagged ÷ all trades)', () => {
    const result = pillar('market', cleanDay(4), {
      calendar: [makeNews('2026-06-01T08:10:00Z')],
    });
    expect(result.points).toBe(7.5);
    expect(result.deductions).toEqual([
      {
        reason: 'Entered within 15 min of high-impact USD news',
        tradeIds: ['t1'],
        pointsLost: 2.5,
      },
    ]);
  });

  it('counts a rollover entry separately', () => {
    const result = pillar('market', [
      ...cleanDay(3),
      { openTime: '2026-06-01T23:50:00Z', durationMinutes: 30 },
    ]);
    expect(result.points).toBe(7.5);
    expect(result.deductions[0]?.reason).toBe('Entered in the rollover window');
  });
});

describe('recency weighting (§6.1)', () => {
  const asOf = toMs('2026-09-20T12:30:00Z');

  it('weighs a ten-day-old impurity half as heavily as a clean trade today', () => {
    const trades = [
      makeTrade({ id: 'old', openTime: '2026-09-10T12:30:00Z', durationMinutes: 30 }),
      makeTrade({ id: 'new', openTime: '2026-09-20T12:30:00Z', durationMinutes: 30 }),
    ];
    const enriched = enrich(trades, { calendar: [makeNews('2026-09-10T12:30:00Z')] });

    const weighted = computeKarat(enriched, DEFAULT_SETTINGS, asOf).pillars.find(
      (candidate) => candidate.key === 'market',
    );
    const unweighted = computeKarat(enriched, DEFAULT_SETTINGS, asOf, {
      weighted: false,
    }).pillars.find((candidate) => candidate.key === 'market');

    // Weighted: flagged 0.5 of 1.5 → 10 × (1 − 1/3) = 6.67. Unweighted: 5.
    expect(weighted?.points).toBe(6.67);
    expect(unweighted?.points).toBe(5);
  });

  it('drops trades older than the rolling window', () => {
    const enriched = enrich([
      makeTrade({ openTime: '2026-08-01T08:00:00Z' }),
      makeTrade({ openTime: '2026-09-19T08:00:00Z' }),
    ]);
    expect(computeKarat(enriched, DEFAULT_SETTINGS, asOf).tradeCount).toBe(1);
  });
});

describe('minimum sample (§6.1)', () => {
  const asOf = toMs('2026-06-02T00:00:00Z');

  it('says "Assaying…" under ten trades', () => {
    const result = computeKarat(enrich(makeTrades(cleanDay(9, 6))), DEFAULT_SETTINGS, asOf);
    expect(result.state).toBe('assaying');
    expect(result.karat).toBeNull();
    expect(result.tier).toBeNull();
    // The pillars are still computed — the rings draw, the number does not.
    expect(result.points).toBeGreaterThan(0);
  });

  it('scores at ten', () => {
    const result = computeKarat(enrich(makeTrades(cleanDay(10, 6))), DEFAULT_SETTINGS, asOf);
    expect(result.state).toBe('scored');
    expect(result.tradeCount).toBe(10);
    expect(result.karat).not.toBeNull();
  });
});

describe('Karat and tiers (§6.1, §6.2)', () => {
  it('converts points to a 24K scale with one decimal', () => {
    expect(karatFromPoints(100)).toBe(24);
    expect(karatFromPoints(0)).toBe(0);
    expect(karatFromPoints(89.2)).toBe(21.4); // 89.2 ÷ 100 × 24 = 21.408
    expect(karatFromPoints(50)).toBe(12);
  });

  it('names every tier at its boundary', () => {
    expect(tierFor(24).label).toBe('24K · Pure');
    expect(tierFor(23.5).label).toBe('24K · Pure');
    expect(tierFor(23.4).label).toBe('22K · Refined');
    expect(tierFor(22).label).toBe('22K · Refined');
    expect(tierFor(21.9).label).toBe('18K · Solid');
    expect(tierFor(18).label).toBe('18K · Solid');
    expect(tierFor(17.9).label).toBe('14K · Mixed');
    expect(tierFor(14).label).toBe('14K · Mixed');
    expect(tierFor(13.9).label).toBe('10K · Alloyed');
    expect(tierFor(10).label).toBe('10K · Alloyed');
    expect(tierFor(9.9).label).toBe('Raw Ore');
    expect(tierFor(0).label).toBe('Raw Ore');
  });

  it('reads the tier from the displayed value, not the raw one', () => {
    // 23.46 is shown as 23.5K, so it may not be labelled 22K.
    expect(tierFor(23.46).label).toBe('24K · Pure');
  });
});

describe('the explainability contract (§6.5)', () => {
  it('makes every pillar deduction add up to the points it lost', () => {
    const enriched = enrich(
      makeTrades([
        { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -150, slDistance: 13 },
        { openTime: '2026-06-01T08:40:00Z', volume: 0.3, netProfit: -200, durationMinutes: 90 },
        { openTime: '2026-06-01T12:00:00Z', durationMinutes: 30, slDistance: null },
        { openTime: '2026-06-01T14:00:00Z', durationMinutes: 30 },
        { openTime: '2026-06-01T15:00:00Z', durationMinutes: 30 },
        { openTime: '2026-06-01T23:50:00Z', durationMinutes: 30 },
      ]),
      { calendar: [makeNews('2026-06-01T14:05:00Z')] },
    );

    const pillars = scorePillars(enriched, DEFAULT_SETTINGS);
    for (const result of pillars) {
      const lost = result.deductions.reduce((total, item) => total + item.pointsLost, 0);
      expect(lost).toBeCloseTo(result.maxPoints - result.points, 1);
    }
    expect(pointsFromPillars(pillars)).toBeLessThan(100);
  });

  it('names real trade ids in every deduction', () => {
    const ids = new Set(
      enrich(makeTrades([...cleanDay(2), { openTime: '2026-06-01T11:00:00Z', slDistance: null }])).map(
        (trade) => trade.id,
      ),
    );
    for (const result of scorePillars(
      enrich(makeTrades([...cleanDay(2), { openTime: '2026-06-01T11:00:00Z', slDistance: null }])),
      DEFAULT_SETTINGS,
    )) {
      for (const deduction of result.deductions) {
        for (const id of deduction.tradeIds) expect(ids.has(id)).toBe(true);
      }
    }
  });
});
