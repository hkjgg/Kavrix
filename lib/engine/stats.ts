/**
 * Aggregates for the charts (CLAUDE.md §8).
 *
 * The equity curve behind the Purity Line, the session/hour/weekday buckets
 * behind the Gold Clock, and the day cells behind the Vault calendar. No new
 * rules live here — everything is a grouping of what `enrich.ts` already
 * measured.
 */

import type { EnrichedTrade } from './enrich';
import { SESSIONS, manualTrades } from './enrich';
import { karatFromPoints, pointsFromPillars, scorePillars } from './karat';
import { mean, round, safeDivide, sum } from './math';
import type { EngineSettings } from './settings';
import { WEEKDAY_NAMES, dayKey } from './time';

export interface EquityPoint {
  /** Close time — realised P&L lands when the position closes. */
  time: string;
  date: string;
  tradeId: string;
  isManual: boolean;
  r: number;
  cumulativeR: number;
  netProfit: number;
  cumulativeMoney: number;
  /** Running account equity, starting from the first trade's equity at entry. */
  equity: number;
}

export interface BucketStats {
  key: string;
  label: string;
  tradeCount: number;
  netR: number;
  avgR: number;
  netMoney: number;
  /** Percentage, 0–100. */
  winRate: number;
}

export interface CalendarDay {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  tradeCount: number;
  manualTradeCount: number;
  netMoney: number;
  netR: number;
  /**
   * Karat of that day's manual trades alone, unweighted. `null` when the day
   * holds no manual trades.
   */
  karat: number | null;
}

export interface StatsResult {
  equityCurve: EquityPoint[];
  startingEquity: number;
  endingEquity: number;
  netMoney: number;
  netR: number;
  tradeCount: number;
  manualTradeCount: number;
  eaTradeCount: number;
  winRate: number;
  bySession: BucketStats[];
  byHour: BucketStats[];
  byWeekday: BucketStats[];
  calendarDays: CalendarDay[];
}

function bucket(
  key: string,
  label: string,
  trades: readonly EnrichedTrade[],
): BucketStats {
  const rs = trades.map((trade) => trade.rMultiple);
  return {
    key,
    label,
    tradeCount: trades.length,
    netR: round(sum(rs), 2),
    avgR: round(mean(rs), 3),
    netMoney: round(sum(trades.map((trade) => trade.netProfit)), 2),
    winRate: round(
      safeDivide(trades.filter((trade) => trade.isWin).length * 100, trades.length, 0),
      1,
    ),
  };
}

export interface StatsOptions {
  /** Restrict the aggregates to manual trades. Default false — the Vault shows everything. */
  manualOnly?: boolean;
}

/**
 * Choice: the equity curve is ordered by **close** time and runs over every
 * trade, manual and EA alike — it is the account's money, and the account does
 * not care who pressed the button. `isManual` rides along so the Purity Line
 * can shade the manual stretch.
 */
export function computeStats(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  options: StatsOptions = {},
): StatsResult {
  const population = options.manualOnly === true ? manualTrades(trades) : trades;
  const ordered = population
    .slice()
    .sort((a, b) => a.closeTimeMs - b.closeTimeMs || a.id.localeCompare(b.id));

  const startingEquity = ordered[0]?.equityAtEntry ?? 0;
  const equityCurve: EquityPoint[] = [];
  let cumulativeR = 0;
  let cumulativeMoney = 0;
  for (const trade of ordered) {
    cumulativeR += trade.rMultiple;
    cumulativeMoney += trade.netProfit;
    equityCurve.push({
      time: trade.closeTime,
      date: dayKey(trade.closeTimeMs),
      tradeId: trade.id,
      isManual: trade.isManual,
      r: round(trade.rMultiple, 3),
      cumulativeR: round(cumulativeR, 3),
      netProfit: round(trade.netProfit, 2),
      cumulativeMoney: round(cumulativeMoney, 2),
      equity: round(startingEquity + cumulativeMoney, 2),
    });
  }

  const bySession: BucketStats[] = SESSIONS.map((session) =>
    bucket(
      session.key,
      session.label,
      population.filter((trade) => trade.sessions.includes(session.key)),
    ),
  );
  // 21:00–00:00 UTC belongs to no session in §5; the trades still happened.
  const outside = population.filter((trade) => trade.sessions.length === 0);
  if (outside.length > 0) {
    bySession.push(bucket('none', 'Outside sessions', outside));
  }

  const byHour: BucketStats[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    byHour.push(
      bucket(
        String(hour).padStart(2, '0'),
        `${String(hour).padStart(2, '0')}:00`,
        population.filter((trade) => trade.hourUtc === hour),
      ),
    );
  }

  const byWeekday: BucketStats[] = WEEKDAY_NAMES.map((name, index) =>
    bucket(
      String(index),
      name,
      population.filter((trade) => trade.weekdayUtc === index),
    ),
  );

  const byDay = new Map<string, EnrichedTrade[]>();
  for (const trade of population) {
    const list = byDay.get(trade.dayKey);
    if (list === undefined) byDay.set(trade.dayKey, [trade]);
    else list.push(trade);
  }

  const calendarDays: CalendarDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayTrades]) => {
      const manual = dayTrades.filter((trade) => trade.isManual);
      return {
        date,
        tradeCount: dayTrades.length,
        manualTradeCount: manual.length,
        netMoney: round(sum(dayTrades.map((trade) => trade.netProfit)), 2),
        netR: round(sum(dayTrades.map((trade) => trade.rMultiple)), 2),
        // Choice: the ingot engraving is that day's own trades, unweighted and
        // with no minimum sample. It is a mark on a day, not the score — the
        // score is the 30-day window in `series.ts`.
        karat:
          manual.length === 0
            ? null
            : karatFromPoints(pointsFromPillars(scorePillars(manual, settings))),
      };
    });

  const allR = population.map((trade) => trade.rMultiple);
  return {
    equityCurve,
    startingEquity: round(startingEquity, 2),
    endingEquity: round(startingEquity + cumulativeMoney, 2),
    netMoney: round(cumulativeMoney, 2),
    netR: round(sum(allR), 2),
    tradeCount: population.length,
    manualTradeCount: population.filter((trade) => trade.isManual).length,
    eaTradeCount: population.filter((trade) => !trade.isManual).length,
    winRate: round(
      safeDivide(population.filter((trade) => trade.isWin).length * 100, population.length, 0),
      1,
    ),
    bySession,
    byHour,
    byWeekday,
    calendarDays,
  };
}

/** Best contiguous window of UTC hours by average R — the Gold Clock's centre label. */
export interface HourWindow {
  startHour: number;
  endHour: number;
  label: string;
  tradeCount: number;
  netR: number;
  avgR: number;
  netMoney: number;
  winRate: number;
}

export interface HourWindowOptions {
  /** Window length in hours. Default 3. */
  hours?: number;
  /** Windows with fewer trades than this are ignored. Default 10. */
  minTrades?: number;
}

/**
 * Ranks every contiguous window of `hours` UTC hours.
 *
 * Choice: the ranking is by **total** R, not average R. Average R alone
 * crowns whichever three hours happen to hold the fewest, luckiest trades; the
 * window a trader should actually protect is the one that carries the edge,
 * and that is total R. `avgR` rides along for the copy.
 *
 * Choice: windows do not wrap past midnight. A "window" that runs 23:00–02:00
 * spans two trading days and would read as one edge when it is two.
 */
export function rankHourWindows(
  trades: readonly EnrichedTrade[],
  options: HourWindowOptions = {},
): HourWindow[] {
  const hours = options.hours ?? 3;
  const minTrades = options.minTrades ?? 10;

  const windows: HourWindow[] = [];
  for (let start = 0; start + hours <= 24; start += 1) {
    const end = start + hours;
    const inWindow = trades.filter(
      (trade) => trade.hourUtc >= start && trade.hourUtc < end,
    );
    if (inWindow.length < minTrades) continue;
    const stats = bucket(String(start), `${start}–${end}`, inWindow);
    windows.push({
      startHour: start,
      endHour: end,
      label: `${String(start).padStart(2, '0')}:00–${String(end).padStart(2, '0')}:00 UTC`,
      tradeCount: stats.tradeCount,
      netR: stats.netR,
      avgR: stats.avgR,
      netMoney: stats.netMoney,
      winRate: stats.winRate,
    });
  }

  return windows.sort((a, b) => b.netR - a.netR || a.startHour - b.startHour);
}
