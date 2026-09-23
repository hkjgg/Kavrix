import { describe, expect, it } from 'vitest';
import type { CalendarDay } from '@/lib/engine';
import { dayStory, enrichTrades, replayDay, resolveSettings, tierFor } from '@/lib/engine';
import { makeNews, makeTrades } from '@/lib/engine/fixtures';
import type { TradeSpec } from '@/lib/engine/fixtures';
import { buildDayAssayView, sentenceParts } from './dayAssay';
import { buildShelves, buildVaultView, monthSummary, moveDate, stepAssayDay } from './vault';
import type { VaultDay } from './vault';

const settings = resolveSettings();
const NEWS = [makeNews('2026-03-02T12:30:00Z', 'US CPI', 1), makeNews('2026-03-02T13:30:00Z', 'US Retail Sales', 2)];
const tierOf = (karat: number) => tierFor(karat).label;

function storyOf(specs: readonly TradeSpec[]) {
  const trades = enrichTrades({ trades: makeTrades(specs.slice()), modifications: [], calendar: NEWS }, settings);
  return dayStory({ day: replayDay('2026-03-02', trades, settings), trades, calendar: NEWS, settings });
}

function calendarDay(date: string, netMoney: number, karat: number | null = 20): CalendarDay {
  return { date, tradeCount: 2, manualTradeCount: 1, netMoney, netR: netMoney / 100, karat };
}

function vaultOf(days: CalendarDay[], firstDate: string, lastDate: string) {
  return buildVaultView({
    calendarDays: days,
    stories: [],
    firstDate,
    lastDate,
    currency: 'USD',
    worst: null,
    tierOf,
  });
}

function daysOf(view: ReturnType<typeof vaultOf>): VaultDay[] {
  return view.months.flatMap((month) => month.weeks.flat()).filter((day): day is VaultDay => day !== null);
}

/* ------------------------------------------------------------------------- */

describe('the ingot’s metal and strip — per day, per month', () => {
  it('casts each day in the engine’s tier for its Karat', () => {
    const view = vaultOf(
      [
        calendarDay('2026-07-01', 100, 24),
        calendarDay('2026-07-02', 100, 22),
        calendarDay('2026-07-03', 100, 18.4),
        calendarDay('2026-07-06', 100, 14),
        calendarDay('2026-07-07', 100, 10.2),
        calendarDay('2026-07-08', 100, 7.1),
        calendarDay('2026-07-09', 100, null),
      ],
      '2026-07-01',
      '2026-07-09',
    );
    const trading = daysOf(view).filter((day) => day.kind === 'trading');
    expect(trading.map((day) => day.tier)).toEqual(['pure', 'refined', 'solid', 'mixed', 'alloyed', 'raw', null]);
    expect(trading.map((day) => day.tierLabel)).toEqual([
      '24K · Pure',
      '22K · Refined',
      '18K · Solid',
      '14K · Mixed',
      '10K · Alloyed',
      'Raw Ore',
      null,
    ]);
  });

  it('measures the strip against the month’s own largest day, not the history’s', () => {
    const view = vaultOf(
      [calendarDay('2026-06-30', -2000), calendarDay('2026-07-01', 400), calendarDay('2026-07-02', -800)],
      '2026-06-30',
      '2026-07-02',
    );
    const [june, july] = view.months;
    expect(june?.maxAbsMoney).toBe(2000);
    expect(july?.maxAbsMoney).toBe(800);
    const julyDays = july?.weeks.flat().filter((day): day is VaultDay => day !== null) ?? [];
    expect(julyDays.map((day) => day.strip)).toEqual([
      { direction: 'profit', share: 0.5 },
      { direction: 'loss', share: 1 },
    ]);
  });

  it('hallmarks the month’s best and worst day once each, and a one-day month not at all', () => {
    const view = vaultOf(
      [
        calendarDay('2026-06-30', 50),
        calendarDay('2026-07-01', 300),
        calendarDay('2026-07-02', -500),
        calendarDay('2026-07-03', 100),
      ],
      '2026-06-30',
      '2026-07-03',
    );
    const [june, july] = view.months;
    expect(june?.weeks.flat().map((day) => day?.mark ?? null)).not.toContain('best');
    const marks = (july?.weeks.flat() ?? []).flatMap((day) => (day === null || day.mark === null ? [] : [[day.date, day.mark]]));
    expect(marks).toEqual([
      ['2026-07-01', 'best'],
      ['2026-07-02', 'worst'],
    ]);
  });

  it('stamps the month’s mean day Karat with its tier', () => {
    const view = vaultOf([calendarDay('2026-07-01', 100, 22), calendarDay('2026-07-02', 100, 15)], '2026-07-01', '2026-07-02');
    // (22 + 15) ÷ 2 = 18.5 → 18K · Solid.
    expect(view.months[0]?.summary.averageKarat).toBe(18.5);
    expect(view.months[0]?.summary.averageTier).toBe('solid');
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
    expect(saturday?.strip.direction).toBe('none');
    expect(saturday?.tier).toBeNull();
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
      averageTier: null,
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
      averageTier: null,
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


describe('stepAssayDay — the Day Assay’s own arrows', () => {
  const dates = ['2026-07-01', '2026-07-02', '2026-07-06'];

  it('goes to the nearest day either side that has an assay', () => {
    expect(stepAssayDay('2026-07-02', 1, dates)).toBe('2026-07-06');
    expect(stepAssayDay('2026-07-06', -1, dates)).toBe('2026-07-02');
    // From a quiet day in between.
    expect(stepAssayDay('2026-07-04', -1, dates)).toBe('2026-07-02');
    expect(stepAssayDay('2026-07-04', 1, dates)).toBe('2026-07-06');
  });

  it('stops at the ends', () => {
    expect(stepAssayDay('2026-07-01', -1, dates)).toBeNull();
    expect(stepAssayDay('2026-07-06', 1, dates)).toBeNull();
  });
});

describe('buildDayAssayView — one day, joined trade by trade', () => {
  // $10,000, 1% risk, 1R = $100. The 12:28 entry is two minutes before CPI.
  const story = storyOf([
    { openTime: '2026-03-02T15:00:00Z', netProfit: 100 },
    { openTime: '2026-03-02T08:00:00Z', netProfit: 100 },
    { openTime: '2026-03-02T12:28:00Z', netProfit: -100 },
  ]);
  const view = buildDayAssayView(story, { eaTradeCount: 2 });

  it('lists the trades in the order they were opened, each with its close', () => {
    expect(view.trades.map((trade) => [trade.entry, trade.close])).toEqual([
      ['08:00', '09:00'],
      ['12:28', '13:28'],
      ['15:00', '16:00'],
    ]);
    expect(view.trades.map((trade) => trade.cumulative)).toEqual([100, 0, 100]);
    expect(view.eaTradeCount).toBe(2);
  });

  it('carries the running day Karat after each trade', () => {
    // 1. Clean: 100 points → 24.0K.
    // 2. News: Market Conditions 10 × (1 − 1/2) = 5 → 95 points → 22.8K.
    // 3. Clean: Market Conditions 10 × (1 − 1/3) → 96.67 points → 23.2K.
    expect(view.trades.map((trade) => trade.karatBefore)).toEqual([24, 24, 22.8]);
    expect(view.trades.map((trade) => trade.karatAfter)).toEqual([24, 22.8, 23.2]);
    expect(view.karat).toBe(23.2);
    expect(view.tierLabel).toBe('22K · Refined');
  });

  it('names each trade’s chapter: the open, the slip, the close', () => {
    expect(view.chapters.map((chapter) => [chapter.number, chapter.title, chapter.range])).toEqual([
      [1, 'The open', '08:00–09:00'],
      [2, 'The slip', '12:28–13:28'],
      [3, 'The close', '15:00–16:00'],
    ]);
    expect(view.trades.map((trade) => trade.chapterId)).toEqual(['open', 'slip-1', 'close']);
    expect(view.trades[1]?.impurities).toEqual(['news']);
  });

  it('keeps the releases, in time order', () => {
    expect(view.news.map((event) => [event.time, event.name])).toEqual([
      ['12:30', 'US CPI'],
      ['13:30', 'US Retail Sales'],
    ]);
  });

  it('marks the worst tilt of the history on its own chapter only', () => {
    const tilted = storyOf([
      { openTime: '2026-03-02T12:20:00Z', netProfit: -100 },
      { openTime: '2026-03-02T12:40:00Z', netProfit: -100 },
    ]);
    const start = tilted.chapters[0]?.from ?? '';
    expect(buildDayAssayView(tilted, { worst: { date: '2026-03-02', start } }).chapters[0]?.worstOverall).toBe(true);
    expect(buildDayAssayView(tilted, { worst: { date: '2026-03-03', start } }).chapters[0]?.worstOverall).toBe(false);
  });
});

describe('sentenceParts — phrases cut out of a sentence', () => {
  it('splits a sentence into text and its linked phrases, in order', () => {
    const parts = sentenceParts({
      text: '5 impurities in 27 minutes: mostly 4 oversized positions and 3 revenge trades.',
      links: [
        { phrase: '5 impurities', tradeIds: ['a'] },
        { phrase: '4 oversized positions', tradeIds: ['b'] },
        { phrase: '3 revenge trades', tradeIds: ['c'] },
      ],
    });
    expect(parts.map((part) => part.text).join('')).toBe(
      '5 impurities in 27 minutes: mostly 4 oversized positions and 3 revenge trades.',
    );
    expect(parts.filter((part) => 'tradeIds' in part).map((part) => part.text)).toEqual([
      '5 impurities',
      '4 oversized positions',
      '3 revenge trades',
    ]);
  });

  it('never lands two identical phrases on the same words', () => {
    const parts = sentenceParts({
      text: '1 trade here, 1 trade there.',
      links: [
        { phrase: '1 trade', tradeIds: ['a'] },
        { phrase: '1 trade', tradeIds: ['b'] },
      ],
    });
    expect(parts).toEqual([
      { text: '1 trade', tradeIds: ['a'], key: '0:1 trade' },
      { text: ' here, ' },
      { text: '1 trade', tradeIds: ['b'], key: '1:1 trade' },
      { text: ' there.' },
    ]);
  });
});
