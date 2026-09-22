/**
 * Karat over time — the spine of the Purity Line (CLAUDE.md §8.4) and the
 * source of the Assay Dial's "delta vs last week" (§8.1).
 *
 * One point per UTC day. Each point is the full §6 score as it would have read
 * at the end of that day: the same rolling 30-day window, the same recency
 * weighting, the same minimum sample. Nothing here re-derives a formula —
 * `computeKarat` is called once per day.
 */

import type { EnrichedTrade } from './enrich';
import { manualTrades } from './enrich';
import type { KaratResult } from './karat';
import { computeKarat } from './karat';
import { round } from './math';
import type { EngineSettings } from './settings';
import { DAY_MS, dayKey, dayStartMs } from './time';

export interface KaratSeriesPoint {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  /** End of that day — the `asOf` the point was scored at. */
  asOf: string;
  /** `null` while the window is short of the minimum sample. */
  karat: number | null;
  points: number;
  state: 'scored' | 'assaying';
  /** Manual trades inside the rolling window at that point. */
  windowTradeCount: number;
  /** Manual trades opened on that day. */
  dayTradeCount: number;
}

export interface KaratSeriesOptions {
  /** First day to emit. Defaults to the day of the first manual trade. */
  fromMs?: number;
}

/**
 * Daily Karat from the first manual trade to `asOf`, inclusive.
 *
 * Choice: a day's point is scored at the **end** of the day (its last
 * millisecond), so the last point in the series is the score "now" only when
 * `asOf` is a day boundary. `karatAt` below is what the dial should read.
 */
export function computeKaratSeries(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  asOfMs: number,
  options: KaratSeriesOptions = {},
): KaratSeriesPoint[] {
  const manual = manualTrades(trades).filter((trade) => trade.openTimeMs <= asOfMs);
  if (manual.length === 0) return [];

  const firstMs = options.fromMs ?? manual[0]?.openTimeMs ?? asOfMs;
  const points: KaratSeriesPoint[] = [];

  const dayCounts = new Map<string, number>();
  for (const trade of manual) {
    dayCounts.set(trade.dayKey, (dayCounts.get(trade.dayKey) ?? 0) + 1);
  }

  for (
    let dayMs = dayStartMs(firstMs);
    dayMs <= dayStartMs(asOfMs);
    dayMs += DAY_MS
  ) {
    const endOfDay = Math.min(dayMs + DAY_MS - 1, asOfMs);
    const result = computeKarat(manual, settings, endOfDay);
    const key = dayKey(dayMs);
    points.push({
      date: key,
      asOf: new Date(endOfDay).toISOString(),
      karat: result.karat,
      points: result.points,
      state: result.state,
      windowTradeCount: result.tradeCount,
      dayTradeCount: dayCounts.get(key) ?? 0,
    });
  }

  return points;
}

/** The score as it reads at `asOfMs` itself — what the Assay Dial shows. */
export function karatAt(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  asOfMs: number,
): KaratResult {
  return computeKarat(trades, settings, asOfMs);
}

export interface KaratDelta {
  /** Karat now. `null` while assaying. */
  current: number | null;
  /** Karat `days` ago. `null` when it was assaying then, or there is no history. */
  previous: number | null;
  /** `current − previous`, one decimal. `null` when either side is missing. */
  delta: number | null;
  days: number;
}

/**
 * Change in Karat against the same score `days` ago (default 7).
 *
 * Both sides are scored the same way — the comparison is a real week-on-week
 * move of the same metric, not this week's trades against last week's.
 */
export function karatDelta(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  asOfMs: number,
  days = 7,
): KaratDelta {
  const current = computeKarat(trades, settings, asOfMs).karat;
  const previous = computeKarat(trades, settings, asOfMs - days * DAY_MS).karat;
  return {
    current,
    previous,
    delta: current === null || previous === null ? null : round(current - previous, 1),
    days,
  };
}
