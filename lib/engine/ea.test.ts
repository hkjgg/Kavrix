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
  constellationSummary,
  drawdownBand,
  drawdownPathCount,
  drawdownVsBand,
  drawdownVsBaseline,
  driftSeries,
  eaCorrelations,
  executionQuality,
  expectancyStability,
  finenessFrom,
  finenessLabel,
  intradayCorrelation,
  simulateDrawdowns,
} from './ea';
import type { EaResult } from './ea';
import { enrichTrades } from './enrich';
import type { EnrichedTrade } from './enrich';
import { DEFAULT_SETTINGS, resolveSettings } from './settings';
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
    expect(finenessLabel(930)).toBe('Fine');
    expect(finenessLabel(929.9)).toBe('Standard');
    expect(finenessLabel(850)).toBe('Standard');
    expect(finenessLabel(849.9)).toBe('Watch');
    expect(finenessLabel(700)).toBe('Watch');
    expect(finenessLabel(699.9)).toBe('Degraded');
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

/** One trade a day for `rs.length` days, 09:00 UTC, from `startDay`. */
function dailyTrades(magic: number, rs: readonly number[], startDay = '2026-06-01', hour = 9): TradeSpec[] {
  return rs.map((r, index) => ({
    openTime: new Date(Date.parse(`${startDay}T00:00:00Z`) + index * 86_400_000 + hour * 3_600_000).toISOString(),
    durationMinutes: 30,
    magic,
    netProfit: r * 100,
  }));
}

describe('drift — the numbers behind the alert (§7)', () => {
  it('reports the standard error and the threshold it was measured against', () => {
    // Baseline 0.5 (entered). Recent 20 alternate −0.4 / −0.2: mean −0.3,
    // sample SD √(20 × 0.01 ÷ 19) = 0.10260, SE 0.10260 ÷ √20 = 0.02294.
    // Threshold 0.5 − 2 × 0.02294 = 0.454; (0.5 + 0.3) ÷ 0.02294 = 34.87 SE.
    const rs = [
      ...Array.from({ length: 40 }, () => 0.5),
      ...Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? -0.4 : -0.2)),
    ];
    const result = computeConstellation(
      enrich(eaTrades(1001, rs)),
      [{ magic: 1001, name: 'Gold Scalper', baselineExpectancyR: 0.5 }],
      DEFAULT_SETTINGS,
    );
    const drift = result.eas[0]?.drift;
    expect(drift?.standardErrorR).toBe(0.023);
    expect(drift?.thresholdStandardErrors).toBe(2);
    expect(drift?.thresholdR).toBe(0.454);
    expect(drift?.standardErrors).toBe(34.87);
  });
});

describe('the drift series', () => {
  const trades = [1, 0, -1, -2].map((r, index) => ({
    id: `T-${index + 1}`,
    closeTime: `2026-06-0${index + 1}T10:00:00.000Z`,
    rMultiple: r,
  }));

  it('runs the drift test after every trade from the first full window', () => {
    // Window 2, baseline 0.5, 2 SE.
    //  [1, 0]   mean +0.5, SD 0.7071, SE 0.5 → band −0.5 … +1.5, inside
    //  [0, −1]  mean −0.5, SE 0.5 → 2.0 SE below: not *more* than 2, inside
    //  [−1, −2] mean −1.5, SE 0.5 → 4.0 SE below: under the band
    const points = driftSeries(trades, 0.5, 2, 2);
    expect(points.map((point) => point.index)).toEqual([1, 2, 3]);
    expect(points.map((point) => point.tradeId)).toEqual(['T-2', 'T-3', 'T-4']);
    expect(points.map((point) => point.rollingR)).toEqual([0.5, -0.5, -1.5]);
    expect(points.map((point) => point.standardErrorR)).toEqual([0.5, 0.5, 0.5]);
    expect(points.map((point) => point.lowerR)).toEqual([-0.5, -0.5, -0.5]);
    expect(points.map((point) => point.upperR)).toEqual([1.5, 1.5, 1.5]);
    expect(points.map((point) => point.below)).toEqual([false, false, true]);
  });

  it('is empty until a full window exists', () => {
    expect(driftSeries(trades.slice(0, 1), 0.5, 2, 2)).toEqual([]);
  });

  it('ends exactly on the live alert', () => {
    const rs = [
      ...Array.from({ length: 40 }, () => 0.5),
      ...Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? -0.4 : -0.2)),
    ];
    const ea = computeConstellation(
      enrich(eaTrades(1001, rs)),
      [{ magic: 1001, name: 'Gold Scalper', baselineExpectancyR: 0.5 }],
      DEFAULT_SETTINGS,
    ).eas[0];
    const last = ea?.driftSeries.at(-1);
    expect(ea?.driftSeries).toHaveLength(41); // trades 20 … 60
    expect(last?.rollingR).toBe(ea?.drift.recentExpectancyR);
    expect(last?.lowerR).toBe(ea?.drift.thresholdR);
    expect(last?.below).toBe(ea?.drift.alert);
  });
});

describe('same-day clustering (ρ)', () => {
  it('is the intraclass correlation of R within a day', () => {
    // Mean 0. Day 1 [2, 1]: (3)² − 5 = 4. Day 2 [−1, −2]: 4. Four ordered
    // pairs → 8 ÷ 4 = 2; variance (4 + 1 + 1 + 4) ÷ 4 = 2.5 → ρ = 0.8.
    expect(
      intradayCorrelation([
        { day: 'a', r: 2 },
        { day: 'a', r: 1 },
        { day: 'b', r: -1 },
        { day: 'b', r: -2 },
      ]),
    ).toBeCloseTo(0.8, 10);
  });

  it('is 0 when same-day trades pull against each other, and never negative', () => {
    expect(
      intradayCorrelation([
        { day: 'a', r: 1 },
        { day: 'a', r: -1 },
        { day: 'b', r: 1 },
        { day: 'b', r: -1 },
      ]),
    ).toBe(0);
  });

  it('caps at 0.95 and is 0 with one trade a day', () => {
    expect(
      intradayCorrelation([
        { day: 'a', r: 1 },
        { day: 'a', r: 1 },
        { day: 'b', r: -1 },
        { day: 'b', r: -1 },
      ]),
    ).toBe(0.95);
    expect(
      intradayCorrelation([
        { day: 'a', r: 1 },
        { day: 'b', r: -1 },
      ]),
    ).toBe(0);
  });
});

describe('the Monte Carlo drawdown band (§7)', () => {
  it('gives every path the full count up to the budget, then tapers to the floor', () => {
    expect(drawdownPathCount(294, DEFAULT_SETTINGS)).toBe(2_000);
    expect(drawdownPathCount(500, DEFAULT_SETTINGS)).toBe(2_000); // 1,000,000 ÷ 500
    expect(drawdownPathCount(1_000, DEFAULT_SETTINGS)).toBe(1_000);
    expect(drawdownPathCount(50_000, DEFAULT_SETTINGS)).toBe(200);
    expect(drawdownPathCount(0, DEFAULT_SETTINGS)).toBe(0);
  });

  it('is exact with no dispersion: a steady loser falls by every trade', () => {
    // −1R a trade, five trades over two days: every path falls 5R.
    expect(simulateDrawdowns(-1, 0, [3, 2], 0, 10)).toEqual(Array.from({ length: 10 }, () => 5));
    // A steady winner never draws down.
    expect(simulateDrawdowns(0.5, 0, [3, 2], 0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('is seeded from its inputs: the same backtest draws the same band', () => {
    const one = simulateDrawdowns(0.2, 1, [4, 4, 4, 4, 4], 0.3, 200);
    const two = simulateDrawdowns(0.2, 1, [4, 4, 4, 4, 4], 0.3, 200);
    expect(one).toEqual(two);
    expect(one).not.toEqual(simulateDrawdowns(0.2, 1, [4, 4, 4, 4, 4], 0.6, 200));
    // Ascending, and positive.
    expect(one.every((value, index) => index === 0 || value >= (one[index - 1] ?? 0))).toBe(true);
    expect(one[0]).toBeGreaterThanOrEqual(0);
  });

  it('widens when same-day trades move together', () => {
    const layout = Array.from({ length: 40 }, () => 5);
    const independent = simulateDrawdowns(0.2, 1, layout, 0, 1_000);
    const clustered = simulateDrawdowns(0.2, 1, layout, 0.8, 1_000);
    expect(clustered[949] ?? 0).toBeGreaterThan((independent[949] ?? 0) * 1.5);
  });

  it('places the live drawdown in the band', () => {
    const trades = [1, -1, -1, 1].map((r, index) => ({
      rMultiple: r,
      closeTimeMs: Date.parse(`2026-06-0${index + 1}T10:00:00Z`),
    }));
    // σ ≈ 0: the band collapses to the deterministic drawdown of +0.1R a trade, 0.
    const tight = drawdownBand(0.1, 1e-9, trades, DEFAULT_SETTINGS);
    expect(tight?.liveDrawdownR).toBe(2);
    expect(tight?.p95R).toBe(0);
    expect(tight?.inside).toBe(false);
    expect(tight?.livePercentile).toBe(1);
    expect(tight?.days).toBe(4);
    expect(tight?.intradayCorrelation).toBe(0);
    // Without a dispersion there is no band to draw.
    expect(drawdownBand(0.1, 0, trades, DEFAULT_SETTINGS)).toBeNull();
    expect(drawdownBand(0.1, 1, [], DEFAULT_SETTINGS)).toBeNull();
  });

  it('scores 1 inside the band and the band edge over the live drawdown outside it', () => {
    expect(drawdownVsBand(8, 6)).toBe(1);
    expect(drawdownVsBand(8, 8)).toBe(1);
    expect(drawdownVsBand(8, 16)).toBe(0.5);
    expect(drawdownVsBand(0, 0)).toBe(1);
  });

  it('is what the drawdown component uses once a dispersion is entered', () => {
    const rs = Array.from({ length: 60 }, (_, index) => (index % 3 === 0 ? -1 : 0.6));
    const withBand = computeConstellation(
      enrich(eaTrades(1001, rs)),
      [{ magic: 1001, name: 'Gold Scalper', baselineExpectancyR: 0.07, baselineStdDevR: 0.75 }],
      DEFAULT_SETTINGS,
    ).eas[0];
    expect(withBand?.drawdownBasis).toBe('monte-carlo');
    expect(withBand?.drawdownBand?.trades).toBe(60);
    expect(withBand?.drawdownBand?.paths).toBe(2_000);
    expect(withBand?.components.drawdownVsBaseline).toBe(
      drawdownVsBand(withBand?.drawdownBand?.p95R ?? 0, withBand?.drawdownBand?.liveDrawdownR ?? 0),
    );

    const without = computeConstellation(
      enrich(eaTrades(1001, rs)),
      [{ magic: 1001, name: 'Gold Scalper', baselineExpectancyR: 0.07 }],
      DEFAULT_SETTINGS,
    ).eas[0];
    expect(without?.drawdownBasis).toBe('baseline-period');
    expect(without?.drawdownBand).toBeNull();
  });
});

describe('volume', () => {
  it('adds up the lots an EA traded', () => {
    const specs = eaTrades(1001, [1, -1, 1]).map((spec, index) => ({
      ...spec,
      volume: [0.1, 0.2, 0.05][index],
    }));
    const ea = computeConstellation(enrich(specs), [], DEFAULT_SETTINGS).eas[0];
    expect(ea?.volumeLots).toBe(0.35);
    expect(ea?.name).toBe('EA 1001');
  });
});

describe('correlation (§7) — over shared days only', () => {
  const three = resolveSettings({ eaMinOverlapDays: 3 });

  it('flags two EAs that move together', () => {
    const trades = enrich([...dailyTrades(1001, [1, -1, 2]), ...dailyTrades(1002, [2, -2, 4], '2026-06-01', 10)]);
    const pairs = eaCorrelations(trades, [1001, 1002], three);
    expect(pairs[0]?.correlation).toBe(1);
    expect(pairs[0]?.sameBet).toBe(true);
    expect(pairs[0]?.overlapDays).toBe(3);
    expect(pairs[0]?.enoughOverlap).toBe(true);
  });

  it('does not flag EAs that move against each other', () => {
    const trades = enrich([...dailyTrades(1001, [1, -1, 2]), ...dailyTrades(1002, [-1, 1, -2], '2026-06-01', 10)]);
    const pairs = eaCorrelations(trades, [1001, 1002], three);
    expect(pairs[0]?.correlation).toBe(-1);
    expect(pairs[0]?.sameBet).toBe(false);
  });

  it('ignores the days only one of them traded', () => {
    // 1001 trades 1–5 June, 1002 trades 3–7 June. Shared: 3, 4, 5 June.
    // 1001 on those days: 2, −1, 3. 1002: 4, −2, 6 → exactly 2× → ρ = 1.
    // A zero-filled union grid would have read 0.21 here.
    const trades = enrich([
      ...dailyTrades(1001, [-5, 5, 2, -1, 3]),
      ...dailyTrades(1002, [4, -2, 6, 9, -9], '2026-06-03', 10),
    ]);
    const pair = eaCorrelations(trades, [1001, 1002], three)[0];
    expect(pair?.overlapDays).toBe(3);
    expect(pair?.correlation).toBe(1);
  });

  it('claims no number under the overlap minimum', () => {
    // Nine shared days against the default minimum of ten.
    const rs = [1, -1, 2, -2, 1, -1, 2, -2, 1];
    const trades = enrich([...dailyTrades(1001, rs), ...dailyTrades(1002, rs, '2026-06-01', 10)]);
    const pair = eaCorrelations(trades, [1001, 1002], DEFAULT_SETTINGS)[0];
    expect(pair?.overlapDays).toBe(9);
    expect(pair?.enoughOverlap).toBe(false);
    expect(pair?.correlation).toBeNull();
    expect(pair?.sameBet).toBe(false);
  });

  it('puts the strongest pair first and the unmeasured ones last', () => {
    const rs = Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? 1 : -1) * (index + 1));
    const trades = enrich([
      ...dailyTrades(1001, rs),
      ...dailyTrades(1002, rs.map((r) => r * 2), '2026-06-01', 10),
      ...dailyTrades(1003, rs.map((r) => -r), '2026-06-01', 11),
      ...dailyTrades(1004, [1, -1], '2026-06-01', 12),
    ]);
    const pairs = eaCorrelations(trades, [1001, 1002, 1003, 1004], DEFAULT_SETTINGS);
    expect(pairs.map((pair) => `${pair.a}-${pair.b}`)).toEqual([
      '1001-1002',
      '1001-1003',
      '1002-1003',
      '1001-1004',
      '1002-1004',
      '1003-1004',
    ]);
    expect(pairs[0]?.correlation).toBe(1);
    expect(pairs[1]?.correlation).toBe(-1);
    expect(pairs.slice(3).every((pair) => pair.correlation === null)).toBe(true);
  });
});

describe('the summary row', () => {
  function ea(magic: number, fineness: number | null, alert: boolean): EaResult {
    const base = computeConstellation(enrich(eaTrades(magic, [1])), [], DEFAULT_SETTINGS).eas[0];
    if (base === undefined) throw new Error('fixture');
    return { ...base, magic, fineness, drift: { ...base.drift, alert } };
  }

  it('counts EAs, averages the assayed Fineness and lists the drifting ones', () => {
    const summary = constellationSummary(
      [ea(1003, 424.9, true), ea(1001, 942.9, false), ea(1002, 863.4, false), ea(1004, null, false)],
      [
        { a: 1001, b: 1002, correlation: 0.836, sameBet: true, overlapDays: 65, enoughOverlap: true },
        { a: 1001, b: 1003, correlation: -0.237, sameBet: false, overlapDays: 65, enoughOverlap: true },
      ],
    );
    expect(summary.eaCount).toBe(4);
    expect(summary.assayedCount).toBe(3);
    // (424.9 + 942.9 + 863.4) ÷ 3 = 743.73
    expect(summary.averageFineness).toBe(743.7);
    expect(summary.sameBetPairs).toBe(1);
    expect(summary.driftingMagics).toEqual([1003]);
  });

  it('has no average when nothing is assayed', () => {
    expect(constellationSummary([], []).averageFineness).toBeNull();
  });
});
