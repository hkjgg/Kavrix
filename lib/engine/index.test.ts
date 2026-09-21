/**
 * `runEngine` tests (CLAUDE.md §2, §13).
 *
 * The contract: pure, deterministic, JSON-serializable, and blind to anything
 * that had not happened by `asOf`.
 */

import { describe, expect, it } from 'vitest';
import { runEngine } from './index';
import { makeNews, makeTrades } from './fixtures';
import type { TradeSpec } from './fixtures';
import type { Account, Ea } from './types';

const account: Account = {
  login: 5_203_847,
  server: 'KavrixDemo-Server',
  currency: 'USD',
  balance: 10_000,
  equity: 10_000,
  leverage: 100,
};

const eas: Ea[] = [{ magic: 1001, name: 'Gold Scalper', baselineExpectancyR: 0.3 }];

function specs(): TradeSpec[] {
  return [
    ...Array.from({ length: 12 }, (_, index) => ({
      openTime: `2026-06-${String(index + 1).padStart(2, '0')}T08:00:00Z`,
      durationMinutes: 30,
      netProfit: 100,
    })),
    { openTime: '2026-06-14T12:30:00Z', durationMinutes: 30, netProfit: -250 },
    ...Array.from({ length: 25 }, (_, index) => ({
      openTime: `2026-06-${String((index % 25) + 1).padStart(2, '0')}T15:00:00Z`,
      durationMinutes: 20,
      magic: 1001,
      netProfit: index % 3 === 0 ? -80 : 60,
    })),
  ];
}

function run(asOf: string | number = '2026-06-20T00:00:00Z') {
  return runEngine(
    {
      account,
      trades: makeTrades(specs()),
      modifications: [],
      calendar: [makeNews('2026-06-14T12:30:00Z')],
      eas,
    },
    {},
    asOf,
  );
}

describe('the engine contract', () => {
  it('returns one object holding every surface', () => {
    const result = run();
    expect(result.asOf).toBe('2026-06-20T00:00:00.000Z');
    expect(result.account.currency).toBe('USD');
    expect(result.counts.manualTrades).toBe(13);
    expect(result.counts.eaTrades).toBe(19);
    expect(result.karat.state).toBe('scored');
    expect(result.karat.pillars).toHaveLength(6);
    expect(result.series.length).toBeGreaterThan(0);
    expect(result.constellation.eas).toHaveLength(1);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.stats.equityCurve).toHaveLength(32);
    expect(result.trades).toHaveLength(32);
  });

  it('survives a JSON round trip — no NaN, no Infinity, no Date', () => {
    const result = run();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain('NaN');
    expect(JSON.stringify(result)).not.toContain('Infinity');
  });

  it('is deterministic', () => {
    expect(run()).toEqual(run());
  });

  it('accepts epoch milliseconds as readily as an ISO string', () => {
    expect(run(Date.parse('2026-06-20T00:00:00Z'))).toEqual(run());
  });

  it('knows nothing about trades opened after asOf', () => {
    const early = run('2026-06-05T00:00:00Z');
    expect(early.counts.manualTrades).toBe(4);
    expect(early.trades.every((trade) => trade.openTime <= '2026-06-05T00:00:00Z')).toBe(true);
    expect(early.karat.state).toBe('assaying');
  });

  it('never reads the clock — the same input on a different day is the same result', () => {
    const first = run();
    const second = run();
    expect(second.series).toEqual(first.series);
    expect(second.karat.karat).toBe(first.karat.karat);
  });

  it('carries the resolved settings so a snapshot explains itself', () => {
    const result = runEngine(
      {
        account,
        trades: makeTrades(specs()),
        modifications: [],
        calendar: [],
        eas,
      },
      { riskLimitPercent: 0.5, dailyMaxTrades: 3 },
      '2026-06-20T00:00:00Z',
    );
    expect(result.settings.riskLimitPercent).toBe(0.5);
    expect(result.settings.dailyMaxTrades).toBe(3);
    expect(result.settings.recencyHalfLifeDays).toBe(10);
    // A tighter limit has to cost points somewhere.
    expect(result.karat.points).toBeLessThan(run().karat.points);
  });
});
