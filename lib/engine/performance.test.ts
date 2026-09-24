/**
 * The engine's performance contract (CLAUDE.md §16, §6.6).
 *
 * A demo account is a couple of hundred trades. A real one, after a year of
 * an EA on a fast timeframe, is tens of thousands — and the whole engine runs
 * server-side after every ingest batch (§13). So the shape of the work matters:
 * every module is linear, or linear with a sort, in the number of trades.
 *
 * The benchmark below is the guard on that. It is generous on purpose — it is
 * here to catch an accidental O(n²), not to police a few milliseconds on
 * whatever machine happens to run it.
 */

import { describe, expect, it } from 'vitest';
import { runEngine } from './index';
import { mulberry32 } from './rng';
import type { Ea, NewsEvent, Trade } from './types';

/** A synthetic history: `count` trades, twenty a day, one in seven from an EA. */
function syntheticHistory(count: number, seed = 20260922): {
  trades: Trade[];
  calendar: NewsEvent[];
  eas: Ea[];
  startMs: number;
  days: number;
} {
  const startMs = Date.parse('2025-01-01T00:00:00.000Z');
  const next = mulberry32(seed);
  const trades: Trade[] = [];

  for (let index = 0; index < count; index += 1) {
    const day = Math.floor(index / 20);
    const openMs =
      startMs +
      day * 86_400_000 +
      (4 + (index % 20)) * 3_600_000 +
      Math.floor(next() * 600_000);
    // A slight negative drift, so drawdowns, breaches and impurities all occur.
    const netProfit = Math.round((next() - 0.48) * 300);
    const volume = 0.1 + Math.round(next() * 10) / 100;
    trades.push({
      id: `p${index}`,
      positionId: index + 1,
      symbol: 'XAUUSD',
      magic: index % 7 === 0 ? 1001 : 0,
      comment: '',
      direction: next() < 0.5 ? 'buy' : 'sell',
      volume,
      openTime: new Date(openMs).toISOString(),
      closeTime: new Date(openMs + 1_800_000).toISOString(),
      openPrice: 2400,
      closePrice: 2400 + netProfit / (volume * 100),
      initialSl: next() < 0.1 ? null : 2390,
      initialTp: null,
      finalSl: 2390,
      finalTp: null,
      grossProfit: netProfit,
      commission: 0,
      swap: 0,
      netProfit,
      mfePrice: 2405,
      maePrice: 2395,
      spreadPointsAtEntry: 22,
      spreadPointsAtExit: 22,
      equityAtEntry: 25_000,
      contractSize: 100,
      durationSeconds: 1_800,
      entryDealTicket: index * 2 + 1,
      exitDealTicket: index * 2 + 2,
    });
  }

  const days = Math.ceil(count / 20);
  const calendar: NewsEvent[] = [];
  for (let day = 0; day < days; day += 3) {
    calendar.push({
      eventId: day,
      time: new Date(startMs + day * 86_400_000 + 12.5 * 3_600_000).toISOString(),
      currency: 'USD',
      importance: 'high',
      name: 'US CPI',
    });
  }

  return {
    trades,
    calendar,
    eas: [{ magic: 1001, name: 'Bench', baselineExpectancyR: 0.2 }],
    startMs,
    days,
  };
}

/**
 * The stopwatch's limit. One second is the contract (§16) on a developer
 * machine; a shared CI runner is several times slower and noisier, and timing
 * it measures the runner, not the engine. On CI (`process.env.CI`) the limit
 * is raised rather than the test skipped, so an accidental O(n²) — which costs
 * tens of seconds at 10,000 trades — still fails there. The scaling test
 * below is a ratio, so it holds on any machine and is unchanged.
 */
const LIMIT_MS = process.env.CI ? 5_000 : 1_000;

const account = {
  login: 1,
  server: 'Bench-Server',
  currency: 'USD',
  balance: 25_000,
  equity: 25_000,
  leverage: 100,
};

describe('runEngine performance', () => {
  it(`runs a 10,000-trade history in under ${LIMIT_MS / 1_000} s`, () => {
    const history = syntheticHistory(10_000);
    const input = {
      account,
      trades: history.trades,
      modifications: [],
      calendar: history.calendar,
      eas: history.eas,
    };
    const asOf = history.startMs + (history.days + 1) * 86_400_000;

    // One run to let the JIT settle, then the measured one.
    runEngine(input, {}, asOf);
    const started = performance.now();
    const result = runEngine(input, {}, asOf);
    const elapsedMs = performance.now() - started;

    expect(result.counts.trades).toBe(10_000);
    expect(result.edgeMap.testedCells).toBeGreaterThan(10);
    expect(result.karat.state).toBe('scored');
    expect(elapsedMs).toBeLessThan(LIMIT_MS);
  });

  it('scales close to linearly, not quadratically', () => {
    // Four times the trades must not cost sixteen times the work. The factor
    // is loose — this is an O(n²) alarm, not a stopwatch.
    const measure = (count: number): number => {
      const history = syntheticHistory(count);
      const input = {
        account,
        trades: history.trades,
        modifications: [],
        calendar: history.calendar,
        eas: history.eas,
      };
      const asOf = history.startMs + (history.days + 1) * 86_400_000;
      runEngine(input, {}, asOf);
      const started = performance.now();
      runEngine(input, {}, asOf);
      return performance.now() - started;
    };

    const small = Math.max(measure(2_500), 1);
    const large = measure(10_000);
    expect(large / small).toBeLessThan(10);
  });
});
