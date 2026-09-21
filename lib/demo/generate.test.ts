/**
 * Tests for the demo data generator.
 *
 * Three jobs:
 *  1. prove the generator is deterministic — same seed, same bytes;
 *  2. prove the data is structurally sound — every trade is a real position,
 *     priced at prices the path actually printed, inside the demo window;
 *  3. prove every story CLAUDE.md §11 promises is actually discoverable.
 *
 * The story checks are computed here, by hand, on purpose. The analytics
 * engine is Stage 2; nothing in Stage 1 may pre-empt it, so this file carries
 * its own small, local implementations of the §5/§6 definitions and the demo
 * data has to satisfy them from the outside.
 */

import { describe, expect, it } from 'vitest';
import {
  DEMO_CONTRACT_SIZE,
  DEMO_END_MS,
  DEMO_IMPROVEMENT_START_MS,
  DEMO_SEED,
  DEMO_START_MS,
  DEMO_STARTING_BALANCE,
  DEMO_SYMBOL,
  buildDemoPricePath,
  generateDemoData,
} from './generate';
import { isRolloverTime } from './price';
import type { Deal, NewsEvent, Trade } from '@/lib/engine/types';

const MINUTE_MS = 60_000;

/** ±20 min around a high-impact USD release — the story's window (§11). */
const NEWS_PROXIMITY_MINUTES = 20;
const LONDON_OPEN_START_HOUR = 7;
const LONDON_OPEN_END_HOUR = 10;
/** Revenge thresholds, from CLAUDE.md §6.1. */
const REVENGE_MINUTES = 15;
const REVENGE_LOT_MULTIPLE = 1.25;
/** Overtrading threshold, from CLAUDE.md §6.1. */
const DAILY_TRADE_LIMIT = 5;
/** Risk limit and the no-stop default, from CLAUDE.md §5/§6.1. */
const RISK_LIMIT_PERCENT = 1.5;
const DEFAULT_RISK_PERCENT = 1;

const data = generateDemoData();
const path = buildDemoPricePath();

const manual = data.trades.filter((trade) => trade.magic === 0);
const eaTrades = data.trades.filter((trade) => trade.magic !== 0);
const highImpact: NewsEvent[] = data.calendar.filter((event) => event.importance === 'high');
const highImpactTimes = highImpact.map((event) => Date.parse(event.time));

/* --- local implementations of the §5/§6 definitions ---------------------- */

function initialRisk(trade: Trade): number {
  if (trade.initialSl === null) {
    return (DEFAULT_RISK_PERCENT / 100) * trade.equityAtEntry;
  }
  return Math.abs(trade.openPrice - trade.initialSl) * trade.volume * trade.contractSize;
}

function rMultiple(trade: Trade): number {
  const risk = initialRisk(trade);
  return risk > 0 ? trade.netProfit / risk : 0;
}

function riskPercent(trade: Trade): number {
  if (trade.initialSl === null) return DEFAULT_RISK_PERCENT;
  return (initialRisk(trade) / trade.equityAtEntry) * 100;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const meanA = mean(a.slice(0, n));
  const meanB = mean(b.slice(0, n));
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  if (varianceA === 0 || varianceB === 0) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
}

function nearHighImpactNews(trade: Trade): boolean {
  const openMs = Date.parse(trade.openTime);
  return highImpactTimes.some(
    (eventMs) => Math.abs(openMs - eventMs) <= NEWS_PROXIMITY_MINUTES * MINUTE_MS,
  );
}

function isLondonOpen(trade: Trade): boolean {
  const hour = new Date(trade.openTime).getUTCHours();
  return hour >= LONDON_OPEN_START_HOUR && hour < LONDON_OPEN_END_HOUR;
}

/**
 * Revenge (§6.1): opened within 15 minutes of a losing close, or sized up
 * more than 25% after one. "The previous trade" is read as the last manual
 * trade to close before this one opened.
 */
function revengeTradeIds(): Set<string> {
  const byClose = manual
    .slice()
    .sort((a, b) => Date.parse(a.closeTime) - Date.parse(b.closeTime));
  const ids = new Set<string>();

  for (const trade of manual) {
    const openMs = Date.parse(trade.openTime);
    let previous: Trade | null = null;
    for (const candidate of byClose) {
      if (Date.parse(candidate.closeTime) >= openMs) break;
      previous = candidate;
    }
    if (previous === null || previous.netProfit >= 0) continue;
    const gapMinutes = (openMs - Date.parse(previous.closeTime)) / MINUTE_MS;
    if (gapMinutes <= REVENGE_MINUTES || trade.volume > REVENGE_LOT_MULTIPLE * previous.volume) {
      ids.add(trade.id);
    }
  }
  return ids;
}

const revenge = revengeTradeIds();

function isImpure(trade: Trade): boolean {
  return (
    revenge.has(trade.id) ||
    nearHighImpactNews(trade) ||
    riskPercent(trade) > RISK_LIMIT_PERCENT ||
    trade.initialSl === null ||
    isRolloverTime(Date.parse(trade.openTime))
  );
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dailyNetProfit(magic: number, days: readonly string[]): number[] {
  const own = eaTrades.filter((trade) => trade.magic === magic);
  return days.map((day) =>
    own
      .filter((trade) => dayKey(trade.closeTime) === day)
      .reduce((total, trade) => total + trade.netProfit, 0),
  );
}

/* ------------------------------------------------------------------------ */

describe('determinism', () => {
  it('produces byte-identical output for the same seed', () => {
    const first = generateDemoData();
    const second = generateDemoData();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('produces byte-identical output when the seed is passed explicitly', () => {
    expect(JSON.stringify(generateDemoData({ seed: DEMO_SEED }))).toBe(JSON.stringify(data));
  });

  it('produces different data for a different seed', () => {
    const other = generateDemoData({ seed: DEMO_SEED + 1 });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(data));
    expect(other.meta.seed).toBe(DEMO_SEED + 1);
  });

  it('does not depend on the clock', () => {
    expect(data.meta.startTime).toBe(new Date(DEMO_START_MS).toISOString());
    expect(data.meta.endTime).toBe(new Date(DEMO_END_MS).toISOString());
  });
});

describe('shape of the dataset', () => {
  it('generates around 220 manual trades and three EAs', () => {
    expect(manual.length).toBe(220);
    expect(data.eas.map((ea) => ea.magic)).toEqual([1001, 1002, 1003]);
    for (const ea of data.eas) {
      expect(eaTrades.filter((trade) => trade.magic === ea.magic).length).toBeGreaterThan(50);
      expect(ea.baselineExpectancyR).not.toBeNull();
    }
  });

  it('labels itself as demo data', () => {
    expect(data.meta.label).toBe('Demo data');
    expect(data.meta.days).toBe(90);
  });

  it('reports an account whose balance is the sum of its trades', () => {
    const net = data.trades.reduce((total, trade) => total + trade.netProfit, 0);
    expect(data.account.balance).toBeCloseTo(DEMO_STARTING_BALANCE + net, 1);
    expect(data.account.equity).toBe(data.account.balance);
    expect(data.account.currency).toBe('USD');
  });

  it('describes the symbol it traded', () => {
    expect(data.symbolInfo[DEMO_SYMBOL]).toEqual({ contractSize: DEMO_CONTRACT_SIZE, digits: 2 });
  });
});

describe('structural integrity', () => {
  const dealsByPosition = new Map<number, Deal[]>();
  for (const deal of data.deals) {
    const bucket = dealsByPosition.get(deal.positionId);
    if (bucket === undefined) dealsByPosition.set(deal.positionId, [deal]);
    else bucket.push(deal);
  }

  it('gives every trade exactly one in deal and one out deal', () => {
    expect(dealsByPosition.size).toBe(data.trades.length);
    for (const trade of data.trades) {
      const deals = dealsByPosition.get(trade.positionId) ?? [];
      const entries = deals.filter((deal) => deal.entry === 'in');
      const exits = deals.filter((deal) => deal.entry === 'out');
      expect(entries.length).toBe(1);
      expect(exits.length).toBe(1);
    }
  });

  it('keeps each trade and its deals consistent', () => {
    for (const trade of data.trades) {
      const deals = dealsByPosition.get(trade.positionId) ?? [];
      const entry = deals.find((deal) => deal.entry === 'in');
      const exit = deals.find((deal) => deal.entry === 'out');
      expect(entry).toBeDefined();
      expect(exit).toBeDefined();
      if (entry === undefined || exit === undefined) continue;

      expect(entry.ticket).toBe(trade.entryDealTicket);
      expect(exit.ticket).toBe(trade.exitDealTicket);
      expect(entry.type).toBe(trade.direction);
      expect(exit.type).not.toBe(trade.direction);
      expect(entry.time).toBe(trade.openTime);
      expect(exit.time).toBe(trade.closeTime);
      expect(entry.price).toBe(trade.openPrice);
      expect(exit.price).toBe(trade.closePrice);
      expect(entry.volume).toBe(trade.volume);
      expect(exit.volume).toBe(trade.volume);
      expect(entry.magic).toBe(trade.magic);
      expect(entry.profit).toBe(0);
      expect(exit.profit).toBe(trade.grossProfit);
      expect(entry.commission + exit.commission).toBeCloseTo(trade.commission, 6);
      expect(entry.swap + exit.swap).toBeCloseTo(trade.swap, 6);
      expect(trade.netProfit).toBeCloseTo(
        trade.grossProfit + trade.commission + trade.swap,
        6,
      );
    }
  });

  it('issues unique, chronologically ordered deal tickets', () => {
    const tickets = new Set(data.deals.map((deal) => deal.ticket));
    expect(tickets.size).toBe(data.deals.length);
    for (let i = 1; i < data.deals.length; i += 1) {
      const previous = data.deals[i - 1];
      const current = data.deals[i];
      if (previous === undefined || current === undefined) continue;
      expect(Date.parse(current.time)).toBeGreaterThanOrEqual(Date.parse(previous.time));
    }
  });

  it('keeps every trade inside the demo window, on an open market', () => {
    for (const trade of data.trades) {
      const openMs = Date.parse(trade.openTime);
      const closeMs = Date.parse(trade.closeTime);
      expect(openMs).toBeGreaterThanOrEqual(DEMO_START_MS);
      expect(closeMs).toBeLessThan(DEMO_END_MS);
      expect(closeMs).toBeGreaterThan(openMs);
      expect(trade.durationSeconds).toBe(Math.round((closeMs - openMs) / 1000));
      expect(path.isOpen(path.indexAt(openMs))).toBe(true);
      expect(path.isOpen(path.indexAt(closeMs))).toBe(true);
    }
  });

  it('only quotes prices the price path actually printed', () => {
    for (const trade of data.trades) {
      const from = path.indexAt(Date.parse(trade.openTime));
      const to = path.indexAt(Date.parse(trade.closeTime));
      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      let maxHalfSpread = 0;
      for (let index = from; index <= to; index += 1) {
        low = Math.min(low, path.low(index));
        high = Math.max(high, path.high(index));
        maxHalfSpread = Math.max(maxHalfSpread, path.halfSpread(index));
      }
      // Fills sit on the bid or the ask, so allow the spread either side.
      const floor = low - maxHalfSpread - 0.01;
      const ceiling = high + maxHalfSpread + 0.01;
      for (const price of [trade.openPrice, trade.closePrice, trade.mfePrice, trade.maePrice]) {
        expect(price).toBeGreaterThanOrEqual(floor);
        expect(price).toBeLessThanOrEqual(ceiling);
      }
      expect(Number.isFinite(trade.spreadPointsAtEntry)).toBe(true);
      expect(trade.spreadPointsAtEntry).toBeGreaterThan(0);
    }
  });

  it('places the stop on the losing side of the entry', () => {
    for (const trade of data.trades) {
      if (trade.initialSl === null) continue;
      if (trade.direction === 'buy') expect(trade.initialSl).toBeLessThan(trade.openPrice);
      else expect(trade.initialSl).toBeGreaterThan(trade.openPrice);
    }
  });

  it('attaches every SL modification to a real position, after it opened', () => {
    for (const modification of data.modifications) {
      const trade = data.trades.find(
        (candidate) => candidate.positionId === modification.positionId,
      );
      expect(trade).toBeDefined();
      if (trade === undefined) continue;
      const time = Date.parse(modification.time);
      expect(time).toBeGreaterThan(Date.parse(trade.openTime));
      expect(time).toBeLessThanOrEqual(Date.parse(trade.closeTime));
    }
  });
});

describe('the demo calendar', () => {
  it('is all USD and inside the window', () => {
    expect(highImpact.length).toBeGreaterThan(25);
    for (const event of data.calendar) {
      expect(event.currency).toBe('USD');
      const time = Date.parse(event.time);
      expect(time).toBeGreaterThanOrEqual(DEMO_START_MS);
      expect(time).toBeLessThan(DEMO_END_MS);
    }
    expect(new Set(data.calendar.map((event) => event.eventId)).size).toBe(
      data.calendar.length,
    );
  });

  it('keeps high-impact releases out of the London open', () => {
    for (const event of highImpact) {
      const hour = new Date(event.time).getUTCHours();
      expect(hour < LONDON_OPEN_START_HOUR || hour >= LONDON_OPEN_END_HOUR).toBe(true);
    }
  });
});

describe('story · losses cluster around USD news', () => {
  it('puts at least 60% of manual losses within 20 minutes of a high-impact event', () => {
    const losses = manual.filter((trade) => trade.netProfit < 0);
    const nearNews = losses.filter(nearHighImpactNews);
    expect(losses.length).toBeGreaterThan(50);
    expect(nearNews.length / losses.length).toBeGreaterThanOrEqual(0.6);
  });

  it('makes news-window trading a losing proposition', () => {
    const inWindow = manual.filter(nearHighImpactNews);
    expect(inWindow.length).toBeGreaterThan(40);
    expect(mean(inWindow.map(rMultiple))).toBeLessThan(0);
  });
});

describe('story · revenge trading', () => {
  it('has revenge trades in 10–15% of manual trades', () => {
    const share = revenge.size / manual.length;
    expect(share).toBeGreaterThanOrEqual(0.1);
    expect(share).toBeLessThanOrEqual(0.15);
  });

  it('makes revenge trades clearly worse than the rest', () => {
    const revengeR = mean(manual.filter((trade) => revenge.has(trade.id)).map(rMultiple));
    const calmR = mean(manual.filter((trade) => !revenge.has(trade.id)).map(rMultiple));
    expect(revengeR).toBeLessThan(-0.5);
    expect(calmR).toBeGreaterThan(0);
    expect(calmR - revengeR).toBeGreaterThan(1);
  });
});

describe('story · the London open is the edge', () => {
  it('averages at least +0.7R between 07:00 and 10:00 UTC', () => {
    const london = manual.filter(isLondonOpen);
    expect(london.length).toBeGreaterThan(40);
    expect(mean(london.map(rMultiple))).toBeGreaterThanOrEqual(0.7);
  });

  it('makes the London open the best window of the day', () => {
    const londonR = mean(manual.filter(isLondonOpen).map(rMultiple));
    const elsewhereR = mean(manual.filter((trade) => !isLondonOpen(trade)).map(rMultiple));
    expect(londonR).toBeGreaterThan(elsewhereR);
  });
});

describe('story · the other impurities are present', () => {
  it('includes oversized risk, missing stops, widened stops and rollover entries', () => {
    const oversized = manual.filter((trade) => riskPercent(trade) > RISK_LIMIT_PERCENT);
    const noStop = manual.filter((trade) => trade.initialSl === null);
    const rollover = manual.filter((trade) => isRolloverTime(Date.parse(trade.openTime)));
    const widened = data.modifications.filter((modification) => {
      const trade = data.trades.find(
        (candidate) => candidate.positionId === modification.positionId,
      );
      if (trade === undefined || trade.initialSl === null) return false;
      return (
        Math.abs(modification.sl - trade.openPrice) >
        Math.abs(trade.initialSl - trade.openPrice) + 0.01
      );
    });

    expect(oversized.length).toBeGreaterThanOrEqual(8);
    expect(noStop.length).toBeGreaterThanOrEqual(3);
    expect(widened.length).toBeGreaterThanOrEqual(4);
    expect(rollover.length).toBeGreaterThanOrEqual(3);
  });

  it('includes a few overtrading days, and keeps them rare late on', () => {
    const counts = new Map<string, number>();
    for (const trade of manual) {
      const key = dayKey(trade.openTime);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const overtrading = [...counts.entries()].filter(([, count]) => count > DAILY_TRADE_LIMIT);
    expect(overtrading.length).toBeGreaterThanOrEqual(3);

    const lateOvertrading = overtrading.filter(
      ([key]) => Date.parse(`${key}T00:00:00.000Z`) >= DEMO_IMPROVEMENT_START_MS,
    );
    expect(lateOvertrading.length).toBeLessThan(overtrading.length);
  });
});

describe('story · discipline improves over the last three weeks', () => {
  it('cuts the share of impure trades by more than half', () => {
    const early = manual.filter((trade) => Date.parse(trade.openTime) < DEMO_IMPROVEMENT_START_MS);
    const late = manual.filter(
      (trade) => Date.parse(trade.openTime) >= DEMO_IMPROVEMENT_START_MS,
    );
    expect(early.length).toBeGreaterThan(100);
    expect(late.length).toBeGreaterThan(30);

    const earlyRate = early.filter(isImpure).length / early.length;
    const lateRate = late.filter(isImpure).length / late.length;
    expect(lateRate).toBeLessThan(earlyRate / 2);
  });

  it('shows the closing phase trading better', () => {
    const early = manual.filter((trade) => Date.parse(trade.openTime) < DEMO_IMPROVEMENT_START_MS);
    const late = manual.filter(
      (trade) => Date.parse(trade.openTime) >= DEMO_IMPROVEMENT_START_MS,
    );
    expect(mean(late.map(rMultiple))).toBeGreaterThan(mean(early.map(rMultiple)));
  });
});

describe('story · the EAs', () => {
  it('has EA 1001 and EA 1002 taking the same bet', () => {
    const days = [...new Set(eaTrades.map((trade) => dayKey(trade.closeTime)))].sort();
    const correlation = pearson(dailyNetProfit(1001, days), dailyNetProfit(1002, days));
    expect(correlation).toBeGreaterThanOrEqual(0.6);
  });

  it('has EA 1003 drifting well below its baseline', () => {
    const grid = eaTrades.filter((trade) => trade.magic === 1003);
    const baseline = data.eas.find((ea) => ea.magic === 1003)?.baselineExpectancyR ?? 0;
    const driftMs = Date.parse(data.meta.eaDriftStart);
    const early = grid.filter((trade) => Date.parse(trade.openTime) < driftMs);
    const recent = grid.filter((trade) => Date.parse(trade.openTime) >= driftMs);

    expect(early.length).toBeGreaterThan(30);
    expect(recent.length).toBeGreaterThan(30);

    const earlyExpectancy = mean(early.map(rMultiple));
    const recentExpectancy = mean(recent.map(rMultiple));

    expect(earlyExpectancy).toBeGreaterThan(baseline - 0.15);
    expect(recentExpectancy).toBeLessThan(0);
    expect(baseline - recentExpectancy).toBeGreaterThan(0.5);
  });

  it('keeps the healthy EAs near their stated baseline', () => {
    for (const magic of [1001, 1002]) {
      const own = eaTrades.filter((trade) => trade.magic === magic);
      const baseline = data.eas.find((ea) => ea.magic === magic)?.baselineExpectancyR ?? 0;
      expect(Math.abs(mean(own.map(rMultiple)) - baseline)).toBeLessThan(0.2);
    }
  });
});
