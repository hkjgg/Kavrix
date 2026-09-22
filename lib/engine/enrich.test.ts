/**
 * Enrichment tests (CLAUDE.md §5).
 *
 * Every expected value here is worked out by hand from the fixture defaults:
 * $10,000 equity, 0.10 lots, 100 oz per lot, a 10.00 stop — $100 of risk,
 * exactly 1% of equity, exactly 1R.
 */

import { describe, expect, it } from 'vitest';
import { enrichTrades, recencyWeight, sessionsAt } from './enrich';
import type { EnrichedTrade } from './enrich';
import { DEFAULT_SETTINGS, resolveSettings } from './settings';
import { DAY_MS, toMs } from './time';
import {
  FIXTURE_RISK,
  makeModification,
  makeNews,
  makeTrade,
  makeTrades,
} from './fixtures';
import type { NewsEvent, SlModification, Trade } from './types';

function enrich(
  trades: readonly Trade[],
  extras: { modifications?: SlModification[]; calendar?: NewsEvent[] } = {},
  settings = DEFAULT_SETTINGS,
): EnrichedTrade[] {
  return enrichTrades(
    {
      trades,
      modifications: extras.modifications ?? [],
      calendar: extras.calendar ?? [],
    },
    settings,
  );
}

function only(trade: Trade, extras?: Parameters<typeof enrich>[1]): EnrichedTrade {
  const [enriched] = enrich([trade], extras);
  if (enriched === undefined) throw new Error('expected one enriched trade');
  return enriched;
}

describe('risk and R (§5)', () => {
  it('prices a 10.00 stop on 0.10 lots as $100 — 1% of equity', () => {
    const trade = only(makeTrade({ openTime: '2026-06-01T08:00:00Z' }));
    expect(trade.initialRiskMoney).toBe(FIXTURE_RISK);
    expect(trade.riskPercent).toBe(1);
    expect(trade.noStop).toBe(false);
  });

  it('divides net P&L by initial risk', () => {
    expect(only(makeTrade({ openTime: '2026-06-01T08:00:00Z', netProfit: 180 })).rMultiple).toBe(1.8);
    expect(only(makeTrade({ openTime: '2026-06-01T08:00:00Z', netProfit: -150 })).rMultiple).toBe(-1.5);
  });

  it('falls back to the default risk and marks the trade when there is no stop', () => {
    const trade = only(
      makeTrade({ openTime: '2026-06-01T08:00:00Z', slDistance: null, netProfit: -400 }),
    );
    // 1% of $10,000 = $100 of assumed risk, so −$400 is −4R.
    expect(trade.noStop).toBe(true);
    expect(trade.initialRiskMoney).toBe(100);
    expect(trade.riskPercent).toBe(1);
    expect(trade.rMultiple).toBe(-4);
  });

  it('measures a sell from the other side of the entry', () => {
    const trade = only(
      makeTrade({ openTime: '2026-06-01T08:00:00Z', direction: 'sell', netProfit: -200 }),
    );
    expect(trade.initialSl).toBe(2410);
    expect(trade.initialRiskMoney).toBe(100);
    expect(trade.rMultiple).toBe(-2);
  });

  it('reports MFE and MAE in R, gross of costs', () => {
    const trade = only(
      makeTrade({
        openTime: '2026-06-01T08:00:00Z',
        netProfit: -100,
        mfeDistance: 5, // +0.5R in favour before it turned
        maeDistance: 12, // −1.2R against
      }),
    );
    expect(trade.mfeR).toBe(0.5);
    expect(trade.maeR).toBe(-1.2);
  });
});

describe('sessions (§5)', () => {
  it('puts 08:00 UTC in both Asia and London', () => {
    expect(sessionsAt(toMs('2026-06-01T08:00:00Z'))).toEqual(['asia', 'london']);
  });

  it('puts 12:29 in London alone and 12:30 in London and New York', () => {
    expect(sessionsAt(toMs('2026-06-01T12:29:00Z'))).toEqual(['london']);
    expect(sessionsAt(toMs('2026-06-01T12:30:00Z'))).toEqual(['london', 'newYork']);
  });

  it('closes Asia at 09:00 and New York at 21:00', () => {
    expect(sessionsAt(toMs('2026-06-01T09:00:00Z'))).toEqual(['london']);
    expect(sessionsAt(toMs('2026-06-01T20:59:00Z'))).toEqual(['newYork']);
    expect(sessionsAt(toMs('2026-06-01T21:00:00Z'))).toEqual([]);
  });
});

describe('news proximity (§5)', () => {
  const calendar = [makeNews('2026-06-01T12:30:00Z')];

  it('includes both edges of the ±15 min window', () => {
    for (const time of ['2026-06-01T12:15:00Z', '2026-06-01T12:45:00Z']) {
      expect(only(makeTrade({ openTime: time }), { calendar }).inNewsWindow).toBe(true);
    }
  });

  it('excludes a trade 16 minutes out, and measures the distance', () => {
    const trade = only(makeTrade({ openTime: '2026-06-01T12:46:00Z' }), { calendar });
    expect(trade.inNewsWindow).toBe(false);
    expect(trade.newsProximityMinutes).toBe(16);
    expect(trade.signedNewsProximityMinutes).toBe(16);
  });

  it('signs the distance negative before the release', () => {
    const trade = only(makeTrade({ openTime: '2026-06-01T12:20:00Z' }), { calendar });
    expect(trade.signedNewsProximityMinutes).toBe(-10);
    expect(trade.nearestNewsEventId).toBe(1);
  });

  it('ignores low-impact and non-USD events', () => {
    const noise: NewsEvent[] = [
      { eventId: 9, time: '2026-06-01T12:30:00Z', currency: 'EUR', importance: 'high', name: 'ECB' },
      { eventId: 10, time: '2026-06-01T12:30:00Z', currency: 'USD', importance: 'medium', name: 'Claims' },
    ];
    const trade = only(makeTrade({ openTime: '2026-06-01T12:30:00Z' }), { calendar: noise });
    expect(trade.inNewsWindow).toBe(false);
    expect(trade.newsProximityMinutes).toBeNull();
  });

  it('exempts a trade tagged news-strategy', () => {
    const trade = only(
      makeTrade({ openTime: '2026-06-01T12:30:00Z', comment: 'news-strategy breakout' }),
      { calendar },
    );
    expect(trade.inNewsWindow).toBe(true);
    expect(trade.newsExempt).toBe(true);
    expect(trade.marketConditionFlagged).toBe(false);
  });
});

describe('rollover window (§5)', () => {
  it('catches broker midnight ±15 min on a UTC server', () => {
    expect(only(makeTrade({ openTime: '2026-06-01T23:45:00Z' })).inRolloverWindow).toBe(true);
    expect(only(makeTrade({ openTime: '2026-06-01T00:15:00Z' })).inRolloverWindow).toBe(true);
    expect(only(makeTrade({ openTime: '2026-06-01T23:44:00Z' })).inRolloverWindow).toBe(false);
    expect(only(makeTrade({ openTime: '2026-06-01T00:16:00Z' })).inRolloverWindow).toBe(false);
  });

  it('follows the server clock, not UTC', () => {
    const settings = resolveSettings({ serverUtcOffsetHours: 3 });
    // A UTC+3 broker sees midnight at 21:00 UTC.
    const atServerMidnight = enrich([makeTrade({ openTime: '2026-06-01T21:00:00Z' })], {}, settings);
    const atUtcMidnight = enrich([makeTrade({ openTime: '2026-06-01T00:00:00Z' })], {}, settings);
    expect(atServerMidnight[0]?.inRolloverWindow).toBe(true);
    expect(atUtcMidnight[0]?.inRolloverWindow).toBe(false);
  });
});

describe('stop compliance (§6.1)', () => {
  it('accepts a stop attached within 60 s and rejects one at 61 s', () => {
    const inTime = makeTrade({ openTime: '2026-06-01T08:00:00Z', slDistance: null });
    const late = makeTrade({ openTime: '2026-06-01T08:00:00Z', slDistance: null });

    const a = only(inTime, {
      modifications: [makeModification(inTime.positionId, '2026-06-01T08:00:45Z', 2390)],
    });
    const b = only(late, {
      modifications: [makeModification(late.positionId, '2026-06-01T08:01:01Z', 2390)],
    });

    expect(a.noStop).toBe(false);
    expect(a.initialSlAfterSeconds).toBe(45);
    expect(a.initialRiskMoney).toBe(100);
    expect(a.slCompliant).toBe(true);

    expect(b.noStop).toBe(true);
    expect(b.slCompliant).toBe(false);
  });

  it('flags a stop moved further from entry', () => {
    const trade = makeTrade({ openTime: '2026-06-01T08:00:00Z', netProfit: -250 });
    const enriched = only(trade, {
      modifications: [makeModification(trade.positionId, '2026-06-01T08:30:00Z', 2375)],
    });
    expect(enriched.slWidened).toBe(true);
    expect(enriched.slCompliant).toBe(false);
    // Risk is still measured from the *initial* stop, not the widened one.
    expect(enriched.initialRiskMoney).toBe(100);
    expect(enriched.rMultiple).toBe(-2.5);
  });

  it('does not punish a stop pulled closer to entry', () => {
    const trade = makeTrade({ openTime: '2026-06-01T08:00:00Z' });
    const enriched = only(trade, {
      modifications: [makeModification(trade.positionId, '2026-06-01T08:30:00Z', 2400)],
    });
    expect(enriched.slWidened).toBe(false);
    expect(enriched.slCompliant).toBe(true);
  });

  it('treats removing the stop as the worst widening', () => {
    const trade = makeTrade({ openTime: '2026-06-01T08:00:00Z' });
    const enriched = only(trade, {
      modifications: [makeModification(trade.positionId, '2026-06-01T08:30:00Z', 0)],
    });
    expect(enriched.slWidened).toBe(true);
  });

  it('flags a stop pulled to breakeven and then pushed back out', () => {
    const trade = makeTrade({ openTime: '2026-06-01T08:00:00Z' });
    const enriched = only(trade, {
      modifications: [
        makeModification(trade.positionId, '2026-06-01T08:20:00Z', 2400),
        makeModification(trade.positionId, '2026-06-01T08:40:00Z', 2392),
      ],
    });
    expect(enriched.slWidened).toBe(true);
  });
});

describe('revenge (§6.1, pinned definition)', () => {
  it('fires on a trade opened inside the window after a losing close', () => {
    const [, second] = enrich(
      makeTrades([
        { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -100 },
        { openTime: '2026-06-01T08:40:00Z' }, // 10 min after the loss closed
      ]),
    );
    expect(second?.revenge).toBe(true);
    expect(second?.revengeReason).toBe('window');
    expect(second?.minutesSincePreviousClose).toBe(10);
    expect(second?.previousTradeId).toBe('t1');
  });

  it('fires on a lot over 1.25× the previous trade after a loss, whenever it opens', () => {
    const [, second] = enrich(
      makeTrades([
        { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -100 },
        { openTime: '2026-06-01T11:00:00Z', volume: 0.13 }, // 1.3× — hours later
      ]),
    );
    expect(second?.revenge).toBe(true);
    expect(second?.revengeReason).toBe('size');
  });

  it('does not fire at exactly 1.25× — the rule says "more than"', () => {
    const [, second] = enrich(
      makeTrades([
        { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -100 },
        { openTime: '2026-06-01T11:00:00Z', volume: 0.125 },
      ]),
    );
    expect(second?.revenge).toBe(false);
  });

  it('reports both triggers together', () => {
    const [, second] = enrich(
      makeTrades([
        { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -100 },
        { openTime: '2026-06-01T08:35:00Z', volume: 0.3 },
      ]),
    );
    expect(second?.revengeReason).toBe('both');
  });

  it('does not fire after a winning close', () => {
    const [, second] = enrich(
      makeTrades([
        { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: 100 },
        { openTime: '2026-06-01T08:35:00Z', volume: 0.5 },
      ]),
    );
    expect(second?.revenge).toBe(false);
    expect(second?.previousWasLoss).toBe(false);
  });

  it('measures against the last trade to CLOSE, not the last to open', () => {
    // t1 loses but closes late; t2 opens after it and wins, closing first.
    // t3 opens 5 min after t2's winning close, so the run is broken.
    const [, , third] = enrich(
      makeTrades([
        { openTime: '2026-06-01T08:00:00Z', durationMinutes: 120, netProfit: -100 },
        { openTime: '2026-06-01T08:10:00Z', durationMinutes: 20, netProfit: 100 },
        { openTime: '2026-06-01T08:35:00Z', volume: 0.4 },
      ]),
    );
    expect(third?.previousTradeId).toBe('t2');
    expect(third?.revenge).toBe(false);
  });

  it('never flags an EA trade, and never counts one as the previous trade', () => {
    const [, ea, manual] = enrich(
      makeTrades([
        { openTime: '2026-06-01T08:00:00Z', durationMinutes: 30, netProfit: -100 },
        { openTime: '2026-06-01T08:35:00Z', magic: 1001, volume: 0.9, netProfit: 400 },
        { openTime: '2026-06-01T08:40:00Z', volume: 0.2 },
      ]),
    );
    expect(ea?.revenge).toBe(false);
    // The EA's win is invisible: the manual loss at 08:30 is still the predecessor.
    expect(manual?.previousTradeId).toBe('t1');
    expect(manual?.revenge).toBe(true);
    expect(manual?.revengeReason).toBe('both');
  });
});

describe('recency weighting (§6.1)', () => {
  const asOf = toMs('2026-09-20T00:00:00Z');

  it('halves every ten days', () => {
    expect(recencyWeight(asOf, asOf, 10)).toBe(1);
    expect(recencyWeight(asOf - 10 * DAY_MS, asOf, 10)).toBeCloseTo(0.5, 12);
    expect(recencyWeight(asOf - 20 * DAY_MS, asOf, 10)).toBeCloseTo(0.25, 12);
    expect(recencyWeight(asOf - 30 * DAY_MS, asOf, 10)).toBeCloseTo(0.125, 12);
  });

  it('never exceeds 1 for a trade in the future', () => {
    expect(recencyWeight(asOf + DAY_MS, asOf, 10)).toBe(1);
  });
});

describe('impurity flags', () => {
  it('lists every rule a single trade broke', () => {
    const trade = only(
      makeTrade({
        openTime: '2026-06-01T12:30:00Z',
        slDistance: 20, // 2% risk
        netProfit: -400, // −2R
      }),
      { calendar: [makeNews('2026-06-01T12:30:00Z')] },
    );
    expect(trade.riskPercent).toBe(2);
    expect(trade.rMultiple).toBe(-2);
    expect(trade.impurities).toEqual(['news', 'oversized', 'exitOverrun']);
  });

  it('leaves a clean trade unflagged', () => {
    expect(only(makeTrade({ openTime: '2026-06-01T08:00:00Z' })).impurities).toEqual([]);
  });
});
