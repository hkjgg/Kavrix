import { describe, expect, it } from 'vitest';
import type { CalendarDay } from '@/lib/engine';
import { enrichTrades, replayDay, resolveSettings } from '@/lib/engine';
import { makeNews, makeTrades } from '@/lib/engine/fixtures';
import type { TradeSpec } from '@/lib/engine/fixtures';
import {
  INGOT,
  MIN_FILL_SHARE,
  buildReplayDayView,
  buildShelves,
  buildVaultView,
  ingotBand,
  ingotFill,
  karatTone,
  karatX,
  monthSummary,
  moveDate,
  replaySegment,
  tiltSpans,
} from './vault';
import type { VaultDay } from './vault';

const settings = resolveSettings();
const NEWS = [makeNews('2026-03-02T12:30:00Z', 'US CPI', 1), makeNews('2026-03-02T13:30:00Z', 'US Retail Sales', 2)];

function replayOf(specs: readonly TradeSpec[]) {
  const trades = enrichTrades({ trades: makeTrades(specs.slice()), modifications: [], calendar: NEWS }, settings);
  return replayDay('2026-03-02', trades, settings);
}

function calendarDay(date: string, netMoney: number, karat: number | null = 20): CalendarDay {
  return { date, tradeCount: 2, manualTradeCount: 1, netMoney, netR: netMoney / 100, karat };
}

function vaultOf(days: CalendarDay[], firstDate: string, lastDate: string) {
  return buildVaultView({
    calendarDays: days,
    replay: [],
    firstDate,
    lastDate,
    currency: 'USD',
    worst: null,
    billedTo: (pillar) => pillar,
  });
}

/* ------------------------------------------------------------------------- */

describe('ingotFill — the day cell’s fill and colour', () => {
  it('fills up from the midline for a profit and down for a loss', () => {
    expect(ingotFill(500, 1000)).toEqual({ direction: 'up', share: 0.5 });
    expect(ingotFill(-250, 1000)).toEqual({ direction: 'down', share: 0.25 });
  });

  it('is linear in money against the largest day, and full at it', () => {
    expect(ingotFill(-1000, 1000).share).toBe(1);
    expect(ingotFill(1000, 1000).share).toBe(1);
  });

  it('never draws a moving day as nothing, and a flat day as empty', () => {
    expect(ingotFill(1, 1000)).toEqual({ direction: 'up', share: MIN_FILL_SHARE });
    expect(ingotFill(0, 1000)).toEqual({ direction: 'none', share: 0 });
    expect(ingotFill(Number.NaN, 1000).direction).toBe('none');
  });

  it('keeps the band inside the bar: profit above the midline, loss below', () => {
    const mid = INGOT.height / 2;
    const up = ingotBand({ direction: 'up', share: 1 });
    const down = ingotBand({ direction: 'down', share: 1 });
    const ys = (points: string | null) => (points ?? '').split(' ').map((pair) => Number(pair.split(',')[1]));
    expect(Math.max(...ys(up))).toBe(mid);
    expect(Math.min(...ys(up))).toBe(INGOT.margin);
    expect(Math.min(...ys(down))).toBe(mid);
    expect(Math.max(...ys(down))).toBe(INGOT.height - INGOT.margin);
    expect(ingotBand({ direction: 'none', share: 0 })).toBeNull();
    // Half a profit reaches half-way to the top face: 17 − 14 × 0.5 = 10, where
    // the sloped side stands at 7 × (1 − 10/34) = 4.94 from the edge.
    expect(ingotBand({ direction: 'up', share: 0.5 })).toBe('4.94,10 55.06,10 56.5,17 3.5,17');
  });

  it('engraves the Karat in the gold family by tier, never in P&L colours', () => {
    expect(karatTone(23.1)).toBe('fine');
    expect(karatTone(18)).toBe('solid');
    expect(karatTone(14.2)).toBe('mixed');
    expect(karatTone(7.1)).toBe('raw');
    expect(karatTone(null)).toBe('none');
  });

  it('marks trading days jade or oxblood by their own money', () => {
    const view = vaultOf([calendarDay('2026-07-01', 400), calendarDay('2026-07-02', -800)], '2026-07-01', '2026-07-02');
    const days = view.months[0]?.weeks.flat().filter((day): day is VaultDay => day !== null) ?? [];
    expect(days.map((day) => day.fill)).toEqual([
      { direction: 'up', share: 0.5 },
      { direction: 'down', share: 1 },
    ]);
    expect(view.maxAbsMoney).toBe(800);
  });
});

describe('buildShelves — the calendar across month boundaries', () => {
  // Monday 29 June 2026 → Tuesday 7 July 2026, trading on weekdays.
  const view = vaultOf(
    ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07'].map((date) =>
      calendarDay(date, 100),
    ),
    '2026-06-29',
    '2026-07-07',
  );

  it('puts each month on its own shelf, in order', () => {
    expect(view.months.map((month) => month.key)).toEqual(['2026-06', '2026-07']);
    expect(view.months.map((month) => month.label)).toEqual(['June 2026', 'July 2026']);
  });

  it('keeps the weekday columns aligned: Monday first, seven slots a week', () => {
    for (const month of view.months) {
      for (const week of month.weeks) expect(week).toHaveLength(7);
    }
    const [june, july] = view.months;
    // June's shelf: Mon 29 and Tue 30, the rest of the week belongs to July.
    expect(june?.weeks).toHaveLength(1);
    expect(june?.weeks[0]?.map((day) => day?.day ?? null)).toEqual([29, 30, null, null, null, null, null]);
    // July opens on a Wednesday, in column 2, the same column as every Wednesday.
    expect(july?.weeks[0]?.map((day) => day?.day ?? null)).toEqual([null, null, 1, 2, 3, 4, 5]);
    expect(july?.weeks[1]?.map((day) => day?.day ?? null)).toEqual([6, 7, null, null, null, null, null]);
  });

  it('shows the weekend as empty slots, not ingots', () => {
    const july = view.months[1];
    const saturday = july?.weeks[0]?.[5];
    expect(saturday?.date).toBe('2026-07-04');
    expect(saturday?.kind).toBe('quiet');
    expect(saturday?.fill.direction).toBe('none');
    expect(july?.weeks[0]?.[2]?.kind).toBe('trading');
  });

  it('summarises each shelf from its own days only', () => {
    expect(view.months[0]?.summary.tradingDays).toBe(2);
    expect(view.months[1]?.summary.tradingDays).toBe(5);
  });

  it('builds the same shelves from any order of days', () => {
    const shuffled = buildShelves(
      view.months.flatMap((month) => month.weeks.flat()).filter((day): day is VaultDay => day !== null).reverse(),
    );
    expect(shuffled.map((month) => month.weeks.map((week) => week.map((day) => day?.date ?? null)))).toEqual(
      view.months.map((month) => month.weeks.map((week) => week.map((day) => day?.date ?? null))),
    );
  });
});

describe('monthSummary', () => {
  it('reports trading days, net R, the best and worst day and the mean day Karat', () => {
    const view = vaultOf(
      [calendarDay('2026-07-01', 300, 22), calendarDay('2026-07-02', -500, 14), calendarDay('2026-07-03', 100, 20)],
      '2026-07-01',
      '2026-07-05',
    );
    const days = view.months[0]?.weeks.flat().filter((day): day is VaultDay => day !== null) ?? [];
    expect(monthSummary(days)).toEqual({
      tradingDays: 3,
      netR: -1,
      netMoney: -100,
      best: { date: '2026-07-01', netMoney: 300 },
      worst: { date: '2026-07-02', netMoney: -500 },
      averageKarat: 18.7,
    });
  });

  it('is empty for a shelf with no trading', () => {
    const view = vaultOf([], '2026-07-04', '2026-07-05');
    expect(view.months[0]?.summary).toEqual({
      tradingDays: 0,
      netR: 0,
      netMoney: 0,
      best: null,
      worst: null,
      averageKarat: null,
    });
  });
});

describe('moveDate — the calendar keyboard', () => {
  const first = '2026-06-22';
  const last = '2026-09-20';

  it('moves a day either side and a week up or down, across months', () => {
    expect(moveDate('2026-06-30', 'ArrowRight', first, last)).toBe('2026-07-01');
    expect(moveDate('2026-07-01', 'ArrowLeft', first, last)).toBe('2026-06-30');
    expect(moveDate('2026-07-01', 'ArrowUp', first, last)).toBe('2026-06-24');
    expect(moveDate('2026-06-29', 'ArrowDown', first, last)).toBe('2026-07-06');
  });

  it('stays inside the history', () => {
    expect(moveDate('2026-06-24', 'ArrowUp', first, last)).toBe(first);
    expect(moveDate('2026-09-18', 'ArrowDown', first, last)).toBe(last);
    expect(moveDate('2026-07-15', 'Home', first, last)).toBe(first);
    expect(moveDate('2026-07-15', 'End', first, last)).toBe(last);
  });

  it('ignores keys it does not own', () => {
    expect(moveDate('2026-07-15', 'Enter', first, last)).toBeNull();
    expect(moveDate('2026-07-15', 'a', first, last)).toBeNull();
  });
});

describe('the Replay — order and the running Karat, against a hand-worked fixture', () => {
  // $10,000, 1% risk, 1R = $100. The 12:28 entry is two minutes before CPI.
  const day = replayOf([
    { openTime: '2026-03-02T15:00:00Z', netProfit: 100 },
    { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
    { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
  ]);
  const view = buildReplayDayView(day, undefined);

  it('lists the trades in the order they were opened', () => {
    expect(view.rows.map((row) => row.time)).toEqual(['08:00', '12:28', '15:00']);
    expect(view.rows.map((row) => row.index)).toEqual([1, 2, 3]);
  });

  it('carries the running day Karat after each trade', () => {
    // 1. Clean: 100 points → 24.0K.
    // 2. News: Market Conditions 10 × (1 − 1/2) = 5 → 95 points → 22.8K.
    // 3. Clean: Market Conditions 10 × (1 − 1/3) → 96.67 points → 23.2K.
    expect(view.rows.map((row) => row.karatBefore)).toEqual([24, 24, 22.8]);
    expect(view.rows.map((row) => row.karatAfter)).toEqual([24, 22.8, 23.2]);
    expect(view.rows.map((row) => row.karatChange)).toEqual([0, -1.2, 0.4]);
    expect(view.karat).toBe(23.2);
  });

  it('names each impurity and what the Gap bills for it', () => {
    expect(view.rows[1]?.impurities).toEqual(['news']);
    expect(view.rows[1]?.costMoney).toBe(100);
    expect(view.rows[1]?.billedTo).toBe('market');
    expect(view.rows[0]?.billedTo).toBeNull();
  });

  it('draws one continuous line: each row enters where the last one left', () => {
    expect(karatX(24)).toBe(100);
    expect(karatX(12)).toBe(50);
    expect(karatX(0)).toBe(0);
    expect(replaySegment(24, 22.8)).toBe('M100 0 L100 22 L95 50 L95 100');
    const segments = view.rows.map((row) => replaySegment(row.karatBefore, row.karatAfter));
    for (let index = 1; index < segments.length; index += 1) {
      // The x it leaves the bottom at is the x the next row enters the top at.
      const exit = segments[index - 1]?.split(' L').pop()?.split(' ')[0];
      const entry = segments[index]?.slice(1).split(' ')[0];
      expect(exit).toBe(entry);
    }
  });
});

describe('tiltSpans — where a tilt episode’s bracket opens and closes', () => {
  // 12:20 news loss → 12:50 clean → 13:18 news loss (58 min after the first) → 16:00 no stop.
  const day = replayOf([
    { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
    { openTime: '2026-03-02T12:20:00Z', netProfit: -100 },
    { openTime: '2026-03-02T12:50:00Z', netProfit: 100 },
    { openTime: '2026-03-02T13:18:00Z', netProfit: -100 },
    { openTime: '2026-03-02T16:00:00Z', netProfit: -100, slDistance: null },
  ]);

  it('brackets the rows from the first impurity of the run to the last, clean trades inside it', () => {
    expect(day.episodes).toHaveLength(1);
    const spans = tiltSpans(day);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ startIndex: 1, endIndex: 3, start: '12:20', end: '13:18', impurityTradeCount: 2 });
    expect(spans[0]?.karatDrop).toBe(day.episodes[0]?.karatDrop);
    expect(spans[0]?.costMoney).toBe(200);
  });

  it('leaves a lone impurity unbracketed', () => {
    const spans = tiltSpans(day);
    expect(spans.some((span) => span.startIndex <= 4 && span.endIndex >= 4)).toBe(false);
  });

  it('labels the worst of the history when it is on this day', () => {
    const start = day.episodes[0]?.start ?? '';
    expect(tiltSpans(day, { date: '2026-03-02', start })[0]?.worstOverall).toBe(true);
    expect(tiltSpans(day, { date: '2026-03-03', start })[0]?.worstOverall).toBe(false);
    // One episode is not "the worst of the day" — there is nothing to compare it with.
    expect(tiltSpans(day)[0]?.worstOfDay).toBe(false);
  });
});
