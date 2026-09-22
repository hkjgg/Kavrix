/**
 * The Edge Map (CLAUDE.md §6.8).
 *
 * The fixtures build cells whose mean R is obvious by construction, so the
 * tests are about the map's rules — the minimum cell size, the correction, and
 * what may be called a strength — rather than about arithmetic.
 */

import { describe, expect, it } from 'vitest';
import { benjaminiHochberg } from './confidence';
import {
  SESSION_PHASES,
  computeEdgeMap,
  contextOf,
  newsBucket,
  sessionPhasesAt,
} from './edgemap';
import { enrichTrades } from './enrich';
import type { TradeSpec } from './fixtures';
import { makeNews, makeTrades } from './fixtures';
import { resolveSettings } from './settings';
import { DAY_MS } from './time';

const settings = resolveSettings();
const MONDAY = Date.parse('2026-03-02T00:00:00.000Z');

/** `count` trades at `hour` on consecutive weekdays, each making `netProfit`. */
function series(
  hour: number,
  count: number,
  netProfit: number,
  startDay = 0,
): TradeSpec[] {
  const specs: TradeSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    const dayOffset = startDay + index;
    // Skip weekends so the weekday cells stay comparable.
    const weekday = (dayOffset % 7) + 1;
    const skip = weekday >= 6 ? 2 : 0;
    specs.push({
      openTime: new Date(
        MONDAY + (dayOffset + skip) * DAY_MS + hour * 3_600_000,
      ).toISOString(),
      netProfit,
      durationMinutes: 30,
    });
  }
  return specs;
}

function build(specs: readonly TradeSpec[], calendar = [] as ReturnType<typeof makeNews>[]) {
  return enrichTrades(
    { trades: makeTrades(specs.slice()), modifications: [], calendar },
    settings,
  );
}

describe('sessionPhasesAt', () => {
  it('splits every session into its open and the rest', () => {
    expect(SESSION_PHASES.map((phase) => phase.key)).toEqual([
      'asia-open',
      'asia-rest',
      'london-open',
      'london-rest',
      'newYork-open',
      'newYork-rest',
    ]);
  });

  it('puts 08:00 in the London open and the Asia session at once', () => {
    const phases = sessionPhasesAt(Date.parse('2026-03-02T08:00:00Z'));
    expect(phases).toContain('london-open');
    expect(phases).toContain('asia-rest');
  });

  it('keeps 10:00 out of the London open', () => {
    expect(sessionPhasesAt(Date.parse('2026-03-02T10:00:00Z'))).toEqual([
      'london-rest',
    ]);
  });

  it('names the hours no session covers', () => {
    expect(sessionPhasesAt(Date.parse('2026-03-02T22:00:00Z'))).toEqual(['outside']);
  });
});

describe('newsBucket', () => {
  const calendar = [makeNews('2026-03-02T12:30:00Z')];

  it('separates in-window, near and clear', () => {
    const trades = build(
      [
        { openTime: '2026-03-02T12:25:00Z' },
        { openTime: '2026-03-02T13:00:00Z' },
        { openTime: '2026-03-02T16:00:00Z' },
      ],
      calendar,
    );
    expect(newsBucket(trades[0]!, settings)).toBe('in-window');
    expect(newsBucket(trades[1]!, settings)).toBe('near');
    expect(newsBucket(trades[2]!, settings)).toBe('clear');
  });

  it('calls an empty calendar clear rather than unknown', () => {
    const trades = build([{ openTime: '2026-03-02T12:25:00Z' }]);
    expect(newsBucket(trades[0]!, settings)).toBe('clear');
  });
});

describe('contextOf', () => {
  it('prefers "first of day" over what happened yesterday', () => {
    const trades = build([
      { openTime: '2026-03-02T08:00:00Z', netProfit: -100 },
      { openTime: '2026-03-03T08:00:00Z', netProfit: 100 },
    ]);
    expect(contextOf(trades[1]!, true)).toBe('first-of-day');
    expect(contextOf(trades[1]!, false)).toBe('after-loss');
  });

  it('has no previous trade for the very first one', () => {
    const trades = build([{ openTime: '2026-03-02T08:00:00Z' }]);
    expect(contextOf(trades[0]!, false)).toBe('no-prior');
  });
});

describe('computeEdgeMap', () => {
  it('does not test a cell under the minimum', () => {
    const trades = build(series(8, 5, 100));
    const map = computeEdgeMap(trades, settings);
    const london = map.cells.find((cell) => cell.key === 'london-open');
    expect(london).toBeUndefined();
    expect(
      map.skippedCells.some((cell) => cell.key === 'london-open' && cell.tradeCount === 5),
    ).toBe(true);
  });

  it('tests a cell at exactly the minimum', () => {
    const trades = build(series(8, 8, 100));
    const map = computeEdgeMap(trades, settings);
    expect(map.cells.some((cell) => cell.key === 'london-open')).toBe(true);
  });

  it('finds a built-in edge and reports it as a strength', () => {
    // 30 winners at 09:00 — inside the London open and, at that hour, inside
    // no other session — and 30 losers in the New York afternoon.
    const trades = build([...series(9, 30, 100), ...series(17, 30, -100, 40)]);
    const map = computeEdgeMap(trades, settings);

    const london = map.cells.find((cell) => cell.key === 'london-open');
    expect(london?.avgR).toBeCloseTo(1, 5);
    expect(london?.confidenceLabel).toBe('strong');
    expect(map.strengths[0]?.key).toBe('london-open');

    const afternoon = map.cells.find((cell) => cell.key === 'newYork-rest');
    expect(afternoon?.avgR).toBeCloseTo(-1, 5);
    expect(map.weaknesses[0]?.key).toBe('newYork-rest');
  });

  it('never reports a Weak cell as a strength or a weakness', () => {
    // Alternating wins and losses: a real sample, no real edge.
    const specs = series(8, 40, 100).map((spec, index) => ({
      ...spec,
      netProfit: index % 2 === 0 ? 100 : -100,
    }));
    const map = computeEdgeMap(build(specs), settings);
    expect(map.strengths).toEqual([]);
    expect(map.weaknesses).toEqual([]);
    for (const cell of map.cells) expect(cell.confidenceLabel).toBe('weak');
  });

  it('applies the correction across the whole map, not cell by cell', () => {
    const trades = build([...series(9, 30, 100), ...series(17, 30, -100, 40)]);
    const map = computeEdgeMap(trades, settings);

    const rerun = benjaminiHochberg(
      map.cells.map((cell) => cell.pValue),
      settings.edgeMapAlpha,
    );
    expect(map.cells.map((cell) => cell.qValue)).toEqual(
      rerun.qValues.map((q) => q),
    );
    expect(map.cells.map((cell) => cell.survivedCorrection)).toEqual(rerun.rejected);
    // Every q is at or above its own p — a correction can only be stricter.
    for (const cell of map.cells) expect(cell.qValue).toBeGreaterThanOrEqual(cell.pValue);
  });

  it('downgrades a cell the correction did not clear', () => {
    // One cell with a genuine edge, every other cell pure noise: the map is
    // tested as a whole, so a borderline cell cannot call itself Strong.
    const trades = build([...series(9, 30, 100), ...series(17, 30, -100, 40)]);
    const map = computeEdgeMap(trades, settings);
    for (const cell of map.cells) {
      if (cell.confidenceLabel === 'strong') expect(cell.survivedCorrection).toBe(true);
      if (cell.confidence.label === 'strong' && !cell.survivedCorrection) {
        expect(cell.confidenceLabel).toBe('moderate');
      }
    }
  });

  it('counts every trade once per dimension', () => {
    const trades = build(series(9, 30, 100));
    const map = computeEdgeMap(trades, settings);
    // Tested and skipped together: the weekday and news dimensions partition
    // the population, so nothing may be lost between them. Sessions overlap by
    // design, so they are not checked this way.
    const totalIn = (dimension: 'weekday' | 'news'): number =>
      map.cells
        .filter((cell) => cell.dimension === dimension)
        .reduce((total, cell) => total + cell.tradeCount, 0) +
      map.skippedCells
        .filter((cell) => cell.dimension === dimension)
        .reduce((total, cell) => total + cell.tradeCount, 0);
    expect(totalIn('weekday')).toBe(30);
    expect(totalIn('news')).toBe(30);
  });

  it('ignores EA trades', () => {
    const manual = series(9, 30, 100);
    const ea = series(9, 30, -100, 60).map((spec) => ({ ...spec, magic: 1001 }));
    const map = computeEdgeMap(build([...manual, ...ea]), settings);
    expect(map.tradeCount).toBe(30);
    expect(map.cells.find((cell) => cell.key === 'london-open')?.avgR).toBeCloseTo(1, 5);
  });

  it('is deterministic', () => {
    const trades = build([...series(9, 30, 100), ...series(17, 30, -100, 40)]);
    expect(computeEdgeMap(trades, settings)).toEqual(computeEdgeMap(trades, settings));
  });

  it('survives an empty account', () => {
    const map = computeEdgeMap([], settings);
    expect(map).toMatchObject({ tradeCount: 0, testedCells: 0, strengths: [], weaknesses: [] });
  });
});
