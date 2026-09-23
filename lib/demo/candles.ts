/**
 * Candles for the Trade Dossier's price chart (CLAUDE.md §8), from the demo's
 * own M1 path.
 *
 * The chart shows the market around one trade, so this picks a timeframe that
 * fits the trade on screen and folds the minutes into it. Aggregation only —
 * open of the first minute, highest high, lowest low, close of the last — and
 * no price is ever produced that the path did not print. Minutes with the
 * market shut (the weekend) are skipped rather than drawn flat.
 *
 * The engine holds no price bars (§13 stores deals), so this lives with the
 * demo: the demo is the one account whose bars Kavrix has.
 */

import { buildDemoPricePath } from './generate';
import type { PricePath } from './price';

/** What `aggregateCandles` needs from a bar source. `PricePath` is one. */
export interface MinuteBars {
  readonly startMs: number;
  readonly length: number;
  indexAt(timeMs: number): number;
  timeAt(index: number): number;
  open(index: number): number;
  high(index: number): number;
  low(index: number): number;
  close(index: number): number;
  isOpen(index: number): boolean;
}

export interface Candle {
  /** Start of the candle, epoch milliseconds (UTC). */
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Timeframes the Dossier may use, in minutes. */
export const TIMEFRAMES = [1, 5, 15, 30, 60] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Most candles the chart should hold — enough to read, few enough to see. */
export const MAX_CANDLES = 180;

const MINUTE_MS = 60_000;

/** The smallest timeframe that fits `spanMs` in `MAX_CANDLES` candles. */
export function chooseTimeframe(spanMs: number, maxCandles: number = MAX_CANDLES): Timeframe {
  for (const timeframe of TIMEFRAMES) {
    if (spanMs / (timeframe * MINUTE_MS) <= maxCandles) return timeframe;
  }
  return TIMEFRAMES[TIMEFRAMES.length - 1] ?? 60;
}

/** The start of the candle containing `timeMs`, aligned to UTC. */
export function candleStart(timeMs: number, timeframe: Timeframe): number {
  const size = timeframe * MINUTE_MS;
  return Math.floor(timeMs / size) * size;
}

/**
 * Minutes folded into candles over `[fromMs, toMs)`. Candles are aligned to
 * the timeframe in UTC, so a candle's time never depends on where the window
 * happened to start.
 */
export function aggregateCandles(
  bars: MinuteBars,
  fromMs: number,
  toMs: number,
  timeframe: Timeframe,
): Candle[] {
  const pathEnd = bars.startMs + bars.length * MINUTE_MS;
  const start = Math.max(candleStart(fromMs, timeframe), bars.startMs);
  const end = Math.min(toMs, pathEnd);
  const candles: Candle[] = [];
  let current: Candle | null = null;

  for (let timeMs = start; timeMs < end; timeMs += MINUTE_MS) {
    const index = Math.floor((timeMs - bars.startMs) / MINUTE_MS);
    if (index < 0 || index >= bars.length || !bars.isOpen(index)) continue;
    const bucket = candleStart(timeMs, timeframe);
    if (current === null || current.timeMs !== bucket) {
      if (current !== null) candles.push(current);
      current = {
        timeMs: bucket,
        open: bars.open(index),
        high: bars.high(index),
        low: bars.low(index),
        close: bars.close(index),
      };
    } else {
      current.high = Math.max(current.high, bars.high(index));
      current.low = Math.min(current.low, bars.low(index));
      current.close = bars.close(index);
    }
  }
  if (current !== null) candles.push(current);
  return candles;
}

export interface TradeWindow {
  fromMs: number;
  toMs: number;
  timeframe: Timeframe;
}

/** Context either side of a trade: its own length, at least 45 min, at most 6 h. */
export function tradeWindow(openMs: number, closeMs: number): TradeWindow {
  const duration = Math.max(closeMs - openMs, MINUTE_MS);
  const pad = Math.min(Math.max(duration, 45 * MINUTE_MS), 6 * 60 * MINUTE_MS);
  const fromMs = openMs - pad;
  const toMs = closeMs + pad + MINUTE_MS;
  return { fromMs, toMs, timeframe: chooseTimeframe(toMs - fromMs) };
}

let cachedPath: PricePath | null = null;

/** The demo path, rebuilt once from the seed — the exact bars the demo trades were priced on. */
export function getDemoPricePath(): PricePath {
  if (cachedPath === null) cachedPath = buildDemoPricePath();
  return cachedPath;
}
