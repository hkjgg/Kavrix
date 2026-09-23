import { describe, expect, it } from 'vitest';
import {
  MERGE_GAP_MS,
  clipSegments,
  daySegments,
  easeOut,
  impurityBands,
  karatSegments,
  mergeIntervals,
  pnlDomain,
  pnlPath,
  timeAxis,
  zoomWindow,
} from './dayChart';

const MIN = 60_000;
const at = (hhmm: string) => Date.parse(`2026-06-25T${hhmm}:00.000Z`);

describe('mergeIntervals', () => {
  it('sorts, merges overlaps, and merges stretches closer than the gap', () => {
    expect(mergeIntervals([[50, 60], [0, 10], [5, 20]])).toEqual([
      [0, 20],
      [50, 60],
    ]);
    expect(mergeIntervals([[0, 10], [40, 50]], 30)).toEqual([[0, 50]]);
    expect(mergeIntervals([[0, 10], [41, 50]], 30)).toEqual([
      [0, 10],
      [41, 50],
    ]);
  });
});

describe('daySegments — what the chart spends its width on', () => {
  // 25 June: the tilt 12:20–12:55, a release at 12:30, one more trade 17:00–17:14.
  const trades = [
    { entryMs: at('12:20'), closeMs: at('12:31') },
    { entryMs: at('12:47'), closeMs: at('12:55') },
    { entryMs: at('17:00'), closeMs: at('17:14') },
  ];

  it('pads each trade by 20 minutes and folds the empty afternoon into a break', () => {
    expect(daySegments(trades, [{ ms: at('12:30') }])).toEqual([
      [at('12:00'), at('13:15')],
      [at('16:40'), at('17:34')],
    ]);
  });

  it('draws a release near a trade, and leaves out one hours away', () => {
    expect(daySegments(trades.slice(0, 1), [{ ms: at('13:30') }])).toEqual([[at('12:00'), at('13:40')]]);
    expect(daySegments(trades.slice(0, 1), [{ ms: at('20:00') }])).toEqual([[at('12:00'), at('12:51')]]);
    expect(MERGE_GAP_MS).toBe(45 * MIN);
  });
});

describe('timeAxis — a folded time scale', () => {
  const segments = [
    [0, 60 * MIN],
    [300 * MIN, 330 * MIN],
  ] as const;
  // 90 minutes of drawn time across 100 − 14 = 86 px… on a 0–114 plot.
  const axis = timeAxis(segments, 0, 104, 14);

  it('gives each stretch width in proportion to its length, and each gap a fixed break', () => {
    // 60 min of 90 → 60 px of 90; the break is 14 px; the last 30 min is 30 px.
    expect(axis.x(0)).toBe(0);
    expect(axis.x(60 * MIN)).toBe(60);
    expect(axis.x(300 * MIN)).toBe(74);
    expect(axis.x(330 * MIN)).toBe(104);
    expect(axis.breaks).toEqual([67]);
  });

  it('clamps anything outside the drawn day to its ends', () => {
    expect(axis.x(-60 * MIN)).toBe(0);
    expect(axis.x(999 * MIN)).toBe(104);
  });

  it('clips to a zoom window', () => {
    expect(clipSegments(segments, 30 * MIN, 310 * MIN)).toEqual([
      [30 * MIN, 60 * MIN],
      [300 * MIN, 310 * MIN],
    ]);
    expect(clipSegments(segments, 70 * MIN, 200 * MIN)).toEqual([]);
  });

  it('labels whole hours or half hours, never crowded', () => {
    const wide = timeAxis([[at('12:00'), at('14:00')]], 0, 480);
    expect(wide.ticks.map((tick) => tick.label)).toEqual(['12:00', '12:30', '13:00', '13:30', '14:00']);
    for (let index = 1; index < wide.ticks.length; index += 1) {
      expect((wide.ticks[index]?.x ?? 0) - (wide.ticks[index - 1]?.x ?? 0)).toBeGreaterThanOrEqual(38);
    }
  });
});

describe('the two lines', () => {
  const x = (ms: number) => ms / MIN;
  const y = (value: number) => -value;

  it('steps the P&L at each close, from zero to the day’s net', () => {
    expect(
      pnlPath(
        [
          { closeMs: 10 * MIN, cumulative: -5 },
          { closeMs: 20 * MIN, cumulative: 3 },
        ],
        x,
        y,
        0,
        30,
      ),
    ).toMatch(/^M0,0L10,0L10,5L20,5L20,-3L30,-3/);
  });

  it('draws the Karat as one piece per trade: the step at entry, level to the next', () => {
    const segments = karatSegments(
      [
        { id: 'a', entryMs: 10 * MIN, karatBefore: 24, karatAfter: 20, impure: true },
        { id: 'b', entryMs: 20 * MIN, karatBefore: 20, karatAfter: 21, impure: false },
      ],
      x,
      y,
      0,
      30,
    );
    expect(segments).toEqual([
      { tradeId: null, impure: false, d: 'M0 -24 H10' },
      { tradeId: 'a', impure: true, d: 'M10 -24 V-20 H20' },
      { tradeId: 'b', impure: false, d: 'M20 -20 V-21 H30' },
    ]);
  });

  it('bands where impure trades were open, merged', () => {
    expect(
      impurityBands(
        [
          { entryMs: 10 * MIN, closeMs: 20 * MIN, impure: true },
          { entryMs: 15 * MIN, closeMs: 25 * MIN, impure: true },
          { entryMs: 40 * MIN, closeMs: 50 * MIN, impure: false },
        ],
        x,
      ),
    ).toEqual([{ x: 10, width: 15 }]);
  });

  it('keeps zero in view, with headroom both ways', () => {
    expect(pnlDomain([-100, -200])).toEqual([-224, 24]);
    expect(pnlDomain([])).toEqual([-1, 1]);
  });
});

describe('zoom', () => {
  it('frames a chapter’s trades, padded, inside the day', () => {
    const full = [at('12:00'), at('17:34')] as const;
    expect(zoomWindow([{ entryMs: at('12:38'), closeMs: at('12:55') }], full)).toEqual([at('12:30'), at('13:03')]);
    expect(zoomWindow([], full)).toEqual(full);
  });

  it('eases out and stops at 1', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(0.5)).toBe(0.875);
    expect(easeOut(2)).toBe(1);
  });
});
