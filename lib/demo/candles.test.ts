import { describe, expect, it } from 'vitest';
import type { MinuteBars } from './candles';
import { MAX_CANDLES, aggregateCandles, candleStart, chooseTimeframe, getDemoPricePath, tradeWindow } from './candles';
import { getDemoDataset } from './assay';

const MINUTE = 60_000;
const START = Date.UTC(2026, 8, 14, 10, 0);

/** Ten minutes; minute i opens at 100 + i, and minute 7 is closed. */
function fakeBars(): MinuteBars {
  const open = (i: number) => 100 + i;
  return {
    startMs: START,
    length: 10,
    indexAt: (ms) => Math.floor((ms - START) / MINUTE),
    timeAt: (i) => START + i * MINUTE,
    open,
    high: (i) => open(i) + 2,
    low: (i) => open(i) - 1,
    close: (i) => open(i) + 0.5,
    isOpen: (i) => i !== 7,
  };
}

describe('candles', () => {
  it('folds minutes into candles: first open, highest high, lowest low, last close', () => {
    const candles = aggregateCandles(fakeBars(), START, START + 10 * MINUTE, 5);
    expect(candles).toEqual([
      { timeMs: START, open: 100, high: 106, low: 99, close: 104.5 },
      // Minute 7 is shut and skipped: the close is minute 9's.
      { timeMs: START + 5 * MINUTE, open: 105, high: 111, low: 104, close: 109.5 },
    ]);
  });

  it('aligns candles to the timeframe in UTC, wherever the window starts', () => {
    expect(candleStart(START + 7 * MINUTE, 5)).toBe(START + 5 * MINUTE);
    const candles = aggregateCandles(fakeBars(), START + 3 * MINUTE, START + 10 * MINUTE, 5);
    expect(candles[0]?.timeMs).toBe(START);
  });

  it('picks the smallest timeframe that fits the window', () => {
    expect(chooseTimeframe(90 * MINUTE)).toBe(1);
    expect(chooseTimeframe(MAX_CANDLES * MINUTE)).toBe(1);
    expect(chooseTimeframe(10 * 60 * MINUTE)).toBe(5);
    expect(chooseTimeframe(40 * 60 * MINUTE)).toBe(15);
  });

  it('frames a trade with context either side: its own length, 45 min to 6 h', () => {
    const open = START;
    const short = tradeWindow(open, open + 5 * MINUTE);
    expect(open - short.fromMs).toBe(45 * MINUTE);
    const long = tradeWindow(open, open + 10 * 60 * MINUTE);
    expect(open - long.fromMs).toBe(6 * 60 * MINUTE);
  });

  it('never draws a price the demo path did not print', () => {
    const path = getDemoPricePath();
    const trade = getDemoDataset().trades.find((candidate) => candidate.magic === 0);
    if (trade === undefined) throw new Error('no manual trade');
    const window = tradeWindow(Date.parse(trade.openTime), Date.parse(trade.closeTime));
    const candles = aggregateCandles(path, window.fromMs, window.toMs, window.timeframe);
    expect(candles.length).toBeGreaterThan(20);
    expect(candles.length).toBeLessThanOrEqual(MAX_CANDLES + 1);
    for (const candle of candles) {
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
    }
    const entry = candles.find((candle) => candle.timeMs === candleStart(Date.parse(trade.openTime), window.timeframe));
    expect(entry).toBeDefined();
  });
});
