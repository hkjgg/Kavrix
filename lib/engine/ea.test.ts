/**
 * EA Health tests (CLAUDE.md §7).
 *
 * The four Fineness components are pure functions, so each is checked on its
 * own with hand-worked numbers first; then a whole EA is assembled and its
 * performance figures, drift alert and correlation are checked end to end.
 */

import { describe, expect, it } from 'vitest';
import {
  computeConstellation,
  consistency,
  drawdownVsBaseline,
  eaCorrelations,
  executionQuality,
  expectancyStability,
  finenessFrom,
  finenessLabel,
} from './ea';
import { enrichTrades } from './enrich';
import type { EnrichedTrade } from './enrich';
import { DEFAULT_SETTINGS } from './settings';
import { makeTrades } from './fixtures';
import type { TradeSpec } from './fixtures';
import type { Ea } from './types';

function enrich(specs: readonly TradeSpec[]): EnrichedTrade[] {
  return enrichTrades({ trades: makeTrades(specs), modifications: [], calendar: [] }, DEFAULT_SETTINGS);
}

/** `rs` as one trade an hour: $100 of risk, so net P&L is R × 100. */
function eaTrades(magic: number, rs: readonly number[], startDay = '2026-06-01'): TradeSpec[] {
  return rs.map((r, index) => ({
    openTime: new Date(
      Date.parse(`${startDay}T00:00:00Z`) + index * 3_600_000,
    ).toISOString(),
    durationMinutes: 30,
    magic,
    netProfit: r * 100,
  }));
}

describe('expectancy stability (0.40)', () => {
  it('is 1 at or above baseline', () => {
    expect(expectancyStability(0.3, 0.3, 0.1, 2)).toBe(1);
    expect(expectancyStability(0.9, 0.3, 0.1, 2)).toBe(1);
  });

  it('crosses 0.5 exactly where the drift alert fires', () => {
    // 0.2R below baseline on a 0.1R standard error is 2 SE — the drift line.
    expect(expectancyStability(0.1, 0.3, 0.1, 2)).toBe(0.5);
  });

  it('reaches 0 at twice the drift threshold', () => {
    expect(expectancyStability(-0.1, 0.3, 0.1, 2)).toBe(0);
    expect(expectancyStability(-0.5, 0.3, 0.1, 2)).toBe(0);
  });

  it('falls back to the plain ratio without a usable standard error', () => {
    expect(expectancyStability(0.2, 0.4, 0, 2)).toBe(0.5);
    expect(expectancyStability(0.5, 0.4, 0, 2)).toBe(1);
  });
});

describe('drawdown vs baseline (0.30)', () => {
  it('is 1 while the live drawdown stays inside the baseline allowance', () => {
    expect(drawdownVsBaseline([1, -1, 1, -1], [1, -1, 1, -1])).toBe(1);
  });

  it('falls in proportion once the live drawdown is worse', () => {
    // Baseline drawdown 1R, live drawdown 4R over the same number of trades.
    expect(drawdownVsBaseline([1, -1, 1, -1], [-1, -1, -1, -1])).toBe(0.25);
  });

  it('is 1 when there is no live history past the baseline', () => {
    expect(drawdownVsBaseline([1, -1], [])).toBe(1);
  });
});

describe('consistency (0.20)', () => {
  it('is the share of whole blocks that made money', () => {
    expect(consistency([1, 1, 1, 1], 2)).toBe(1);
    expect(consistency([1, 1, -1, -2], 2)).toBe(0.5);
    expect(consistency([-1, -1, -1, -1], 2)).toBe(0);
  });

  it('scores a short history as one block', () => {
    expect(consistency([1, -0.5], 20)).toBe(1);
    expect(consistency([-1, -0.5], 20)).toBe(0);
  });
});

describe('execution quality (0.10)', () => {
  it('is 1 while the EA pays no more than the normal spread of the account', () => {
    expect(executionQuality(22, 22)).toBe(1);
    expect(executionQuality(11, 22)).toBe(1);
  });

  it('halves when the EA pays twice the normal spread', () => {
    expect(executionQuality(44, 22)).toBe(0.5);
  });
});

describe('the Fineness scale (§7)', () => {
  it('caps at 999.9‰', () => {
    expect(
      finenessFrom({
        expectancyStability: 1,
        drawdownVsBaseline: 1,
        consistency: 1,
        executionQuality: 1,
      }),
    ).toBe(999.9);
  });

  it('weights the components 40 / 30 / 20 / 10', () => {
    expect(
      finenessFrom({
        expectancyStability: 0.5,
        drawdownVsBaseline: 1,
        consistency: 1,
        executionQuality: 1,
      }),
    ).toBe(800); // 0.4 × 0.5 + 0.6 = 0.8
    expect(
      finenessFrom({
        expectancyStability: 1,
        drawdownVsBaseline: 0,
        consistency: 1,
        executionQuality: 0,
      }),
    ).toBe(600);
  });

  it('labels each band', () => {
    expect(finenessLabel(999.9)).toBe('Fine');
    expect(finenessLabel(995)).toBe('Fine');
    expect(finenessLabel(994.9)).toBe('Standard');
    expect(finenessLabel(950)).toBe('Standard');
    expect(finenessLabel(949.9)).toBe('Watch');
    expect(finenessLabel(900)).toBe('Watch');
    expect(finenessLabel(899.9)).toBe('Degraded');
  });
});

describe('per-EA performance', () => {
  const eas: Ea[] = [{ magic: 1001, name: 'Gold Scalper', baselineExpectancyR: 0.5 }];

  it('adds up R, profit factor, expectancy and drawdown', () => {
    // +2, −1, +2, −1, +1 → net +3R over 5 trades, expectancy +0.6R.
    const result = computeConstellation(
      enrich(eaTrades(1001, [2, -1, 2, -1, 1])),
      eas,
      DEFAULT_SETTINGS,
    );
    const ea = result.eas[0];
    expect(ea?.tradeCount).toBe(5);
    expect(ea?.netR).toBe(3);
    expect(ea?.expectancyR).toBe(0.6);
    expect(ea?.netMoney).toBe(300);
    expect(ea?.profitFactor).toBe(2.5); // 500 ÷ 200
    expect(ea?.maxDrawdownR).toBe(1);
    expect(ea?.winRate).toBe(60);
  });

  it('takes the last twenty trades as the recent window', () => {
    const rs = [...Array.from({ length: 30 }, () => 1), ...Array.from({ length: 20 }, () => -0.5)];
    const result = computeConstellation(enrich(eaTrades(1001, rs)), eas, DEFAULT_SETTINGS);
    expect(result.eas[0]?.recent20ExpectancyR).toBe(-0.5);
  });

  it('falls back to the first 50 live trades when no baseline was entered', () => {
    const rs = Array.from({ length: 60 }, (_, index) => (index < 50 ? 0.4 : -0.2));
    const result = computeConstellation(
      enrich(eaTrades(1001, rs)),
      [{ magic: 1001, name: 'Gold Scalper', baselineExpectancyR: null }],
      DEFAULT_SETTINGS,
    );
    expect(result.eas[0]?.baselineSource).toBe('first-live-trades');
    expect(result.eas[0]?.baselineExpectancyR).toBe(0.4);
  });

  it('leaves Fineness unassayed under twenty trades', () => {
    const result = computeConstellation(enrich(eaTrades(1001, [1, -1, 1])), eas, DEFAULT_SETTINGS);
    expect(result.eas[0]?.fineness).toBeNull();
    expect(result.eas[0]?.label).toBeNull();
  });
});

describe('drift (§7)', () => {
  const baseline = 0.5;
  const eas: Ea[] = [{ magic: 1001, name: 'Gold Scalper', baselineExpectancyR: baseline }];

  it('fires when the recent twenty sit more than two standard errors below baseline', () => {
    const rs = [
      ...Array.from({ length: 40 }, () => 0.5),
      ...Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? -0.4 : -0.2)),
    ];
    const result = computeConstellation(enrich(eaTrades(1001, rs)), eas, DEFAULT_SETTINGS);
    const drift = result.eas[0]?.drift;
    expect(drift?.recentExpectancyR).toBe(-0.3);
    expect(drift?.standardErrors).toBeGreaterThan(2);
    expect(drift?.alert).toBe(true);
  });

  it('stays quiet for ordinary noise around the baseline', () => {
    const rs = [
      ...Array.from({ length: 40 }, () => 0.5),
      ...Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? 1.4 : -0.5)),
    ];
    const result = computeConstellation(enrich(eaTrades(1001, rs)), eas, DEFAULT_SETTINGS);
    const drift = result.eas[0]?.drift;
    expect(drift?.recentExpectancyR).toBe(0.45);
    expect(drift?.alert).toBe(false);
  });
});

describe('correlation (§7)', () => {
  it('flags two EAs that move together', () => {
    const trades = enrich([
      ...eaTrades(1001, [1, -1, 2], '2026-06-01').map((spec, index) => ({
        ...spec,
        openTime: `2026-06-0${index + 1}T09:00:00Z`,
      })),
      ...eaTrades(1002, [2, -2, 4], '2026-06-01').map((spec, index) => ({
        ...spec,
        openTime: `2026-06-0${index + 1}T10:00:00Z`,
      })),
    ]);
    const pairs = eaCorrelations(
      trades.filter((trade) => !trade.isManual),
      [1001, 1002],
      DEFAULT_SETTINGS,
    );
    expect(pairs[0]?.correlation).toBe(1);
    expect(pairs[0]?.sameBet).toBe(true);
    expect(pairs[0]?.dayCount).toBe(3);
  });

  it('does not flag EAs that move against each other', () => {
    const trades = enrich([
      ...eaTrades(1001, [1, -1, 2]).map((spec, index) => ({
        ...spec,
        openTime: `2026-06-0${index + 1}T09:00:00Z`,
      })),
      ...eaTrades(1002, [-1, 1, -2]).map((spec, index) => ({
        ...spec,
        openTime: `2026-06-0${index + 1}T10:00:00Z`,
      })),
    ]);
    const pairs = eaCorrelations(
      trades.filter((trade) => !trade.isManual),
      [1001, 1002],
      DEFAULT_SETTINGS,
    );
    expect(pairs[0]?.correlation).toBe(-1);
    expect(pairs[0]?.sameBet).toBe(false);
  });
});
