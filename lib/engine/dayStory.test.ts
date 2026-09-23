/**
 * The Day Assay's story (CLAUDE.md §6.11, §8.7).
 *
 * Fixture arithmetic as everywhere in the engine tests: $10,000 equity, $100 of
 * risk a trade, so −$200 is −2R. The demo day is 25 June 2026, the opening
 * week's first tilt: five impurities around the 12:30 GDP release, then one
 * more trade at 17:00.
 */

import { describe, expect, it } from 'vitest';
import { getDemoAssay, getDemoDataset } from '@/lib/demo/assay';
import { chapterRanges, dayStory } from './dayStory';
import { enrichTrades } from './enrich';
import type { TradeSpec } from './fixtures';
import { makeNews, makeTrades } from './fixtures';
import { computeReplay, replayDay } from './replay';
import { resolveSettings } from './settings';

const settings = resolveSettings();
const NEWS = [makeNews('2026-03-02T12:30:00Z', 'US CPI', 1), makeNews('2026-03-02T13:30:00Z', 'US Retail Sales', 2)];

function story(specs: readonly TradeSpec[]) {
  const trades = enrichTrades({ trades: makeTrades(specs.slice()), modifications: [], calendar: NEWS }, settings);
  return dayStory({ day: replayDay('2026-03-02', trades, settings), trades, calendar: NEWS, settings });
}

describe('chapterRanges — which trade belongs to which chapter', () => {
  const F = false;
  const T = true;

  it('makes a clean day one chapter, all of it the open', () => {
    expect(chapterRanges([F, F, F], [])).toEqual([{ kind: 'open', start: 0, end: 2 }]);
  });

  it('names an impurity that never chained a slip, and the clean trades after it the close', () => {
    expect(chapterRanges([F, T, F, F], [])).toEqual([
      { kind: 'open', start: 0, end: 0 },
      { kind: 'slip', start: 1, end: 1 },
      { kind: 'close', start: 2, end: 3 },
    ]);
  });

  it('follows a tilt with a recovery up to the next tilt', () => {
    expect(
      chapterRanges([T, T, F, T, T], [
        { start: 0, end: 1 },
        { start: 3, end: 4 },
      ]),
    ).toEqual([
      { kind: 'tilt', start: 0, end: 1, episode: 0 },
      { kind: 'recovery', start: 2, end: 2 },
      { kind: 'tilt', start: 3, end: 4, episode: 1 },
    ]);
  });

  it('keeps a lone impurity after a tilt inside the recovery', () => {
    expect(chapterRanges([T, T, F, T, F], [{ start: 0, end: 1 }])).toEqual([
      { kind: 'tilt', start: 0, end: 1, episode: 0 },
      { kind: 'recovery', start: 2, end: 4 },
    ]);
  });

  it('runs a slip up to the tilt it precedes, and never makes an empty chapter', () => {
    expect(chapterRanges([F, T, F, T, T], [{ start: 3, end: 4 }])).toEqual([
      { kind: 'open', start: 0, end: 0 },
      { kind: 'slip', start: 1, end: 2 },
      { kind: 'tilt', start: 3, end: 4, episode: 0 },
    ]);
    expect(
      chapterRanges([T, T, T, T], [
        { start: 0, end: 1 },
        { start: 2, end: 3 },
      ]).map((range) => range.kind),
    ).toEqual(['tilt', 'tilt']);
    expect(chapterRanges([], [])).toEqual([]);
  });
});

describe('dayStory — a clean day', () => {
  // +$100, −$50, +$150: all at 1% risk, the loser short of the overrun line.
  const clean = story([
    { openTime: '2026-03-02T08:00:00Z' },
    { openTime: '2026-03-02T09:30:00Z', netProfit: -50 },
    { openTime: '2026-03-02T11:00:00Z', netProfit: 150 },
  ]);
  const ids = clean.karatSeries.map((step) => step.tradeId);

  it('holds 24.0K from the first trade to the last', () => {
    expect(clean.karat).toBe(24);
    expect(clean.tier).toBe('24K · Pure');
    expect(clean.karatSeries.map((step) => [step.karatBefore, step.karatAfter, step.impure])).toEqual([
      [24, 24, false],
      [24, 24, false],
      [24, 24, false],
    ]);
  });

  it('runs the P&L in close order: 100, 50, 200', () => {
    expect(clean.pnl.map((point) => [point.time.slice(11, 16), point.cumulative])).toEqual([
      ['09:00', 100],
      ['10:30', 50],
      ['12:00', 200],
    ]);
  });

  it('is one chapter, the open, and says so in two sentences', () => {
    expect(clean.chapters).toEqual([
      {
        id: 'open',
        kind: 'open',
        number: 1,
        title: 'The open',
        from: '2026-03-02T08:00:00.000Z',
        to: '2026-03-02T12:00:00.000Z',
        tradeIds: ids,
        sentences: [
          {
            text: '3 trades from 08:00 to 11:00, every one clean.',
            links: [{ phrase: '3 trades', tradeIds: ids }],
          },
          { text: 'They made +$200.00 (+2.0R), and the day Karat held at 24.0K.', links: [] },
        ],
      },
    ]);
  });

  it('bills nothing', () => {
    expect(clean.receipt).toEqual({ lines: [], totalMoney: 0, totalR: 0, tradeIds: [] });
  });

  it('keeps the day’s high-impact USD releases', () => {
    expect(clean.news.map((event) => [event.time.slice(11, 16), event.name])).toEqual([
      ['12:30', 'US CPI'],
      ['13:30', 'US Retail Sales'],
    ]);
  });
});

describe('dayStory — a one-trade day', () => {
  // Two minutes before CPI, −$200: news and an overrun on one trade.
  // Pillars 25 + 20 + 15 + 4.5 + 15 + 0 = 79.5 points → 19.08 → 19.1K.
  const one = story([{ openTime: '2026-03-02T12:28:00Z', netProfit: -200 }]);
  const [id] = one.karatSeries.map((step) => step.tradeId);

  it('scores the day from its one trade', () => {
    expect(one.karat).toBe(19.1);
    expect(one.tier).toBe('18K · Solid');
    expect(one.karatSeries).toEqual([
      { tradeId: id, time: '2026-03-02T12:28:00.000Z', karatBefore: 24, karatAfter: 19.1, impure: true, impurities: ['news', 'exitOverrun'] },
    ]);
  });

  it('has exactly one chapter, a slip, with the release named in the phrase', () => {
    expect(one.chapters).toHaveLength(1);
    expect(one.chapters[0]).toEqual({
      id: 'slip-1',
      kind: 'slip',
      number: 1,
      title: 'The slip',
      from: '2026-03-02T12:28:00.000Z',
      to: '2026-03-02T13:28:00.000Z',
      tradeIds: [id],
      sentences: [
        {
          text: '1 impurity at 12:28 that never chained into a tilt: 1 entry in the 12:30 USD news window and 1 overrun loss.',
          links: [
            { phrase: '1 impurity', tradeIds: [id] },
            { phrase: '1 entry in the 12:30 USD news window', tradeIds: [id] },
            { phrase: '1 overrun loss', tradeIds: [id] },
          ],
        },
        {
          text: 'The day Karat fell from 24.0K to 19.1K, and the Gap bills $200.00 for it.',
          links: [{ phrase: '$200.00', tradeIds: [id] }],
        },
      ],
    });
  });

  it('bills the whole loss to Market Conditions, which outranks Exits (§6.3)', () => {
    expect(one.receipt).toEqual({
      lines: [{ pillar: 'market', label: 'Market Conditions', tradeIds: [id], costMoney: 200, costR: 2 }],
      totalMoney: 200,
      totalR: 2,
      tradeIds: [id],
    });
  });
});

describe('dayStory — 25 June 2026, the demo’s first tilt and its recovery', () => {
  const assay = getDemoAssay();
  const date = '2026-06-25';
  const trades = assay.trades.filter((trade) => trade.isManual && trade.dayKey === date);
  const [day] = computeReplay(trades, assay.settings);
  if (day === undefined) throw new Error('25 June has no replay');
  const june25 = dayStory({ day, trades, calendar: getDemoDataset().calendar, settings: assay.settings });
  const tilt = ['T-700043', 'T-700044', 'T-700045', 'T-700046', 'T-700047'];

  it('walks the day Karat 24.0 → 9.5 → 12.5 → 12.0 → 11.7 → 11.9 → 9.7K', () => {
    expect(june25.karatSeries.map((step) => [step.tradeId, step.karatAfter])).toEqual([
      ['T-700043', 9.5],
      ['T-700044', 12.5],
      ['T-700045', 12],
      ['T-700046', 11.7],
      ['T-700047', 11.9],
      ['T-700050', 9.7],
    ]);
    expect(june25.karatSeries.every((step) => step.impure)).toBe(true);
    expect(june25.karat).toBe(9.7);
    expect(june25.tier).toBe('Raw Ore');
  });

  it('runs the P&L in close order and ends on the day’s net', () => {
    // −484.72, −934.04, −509.08, −209.10, +292.34, −285.51.
    expect(june25.pnl.map((point) => [point.tradeId, point.cumulative])).toEqual([
      ['T-700044', -484.72],
      ['T-700043', -1418.76],
      ['T-700045', -1927.84],
      ['T-700046', -2136.94],
      ['T-700047', -1844.6],
      ['T-700050', -2130.11],
    ]);
    expect(june25.netMoney).toBe(-2130.11);
  });

  it('holds the 12:30 GDP release', () => {
    expect(june25.news).toEqual([{ eventId: 840000002, time: '2026-06-25T12:30:00.000Z', name: 'Final GDP q/q' }]);
  });

  it('reads as two chapters: the tilt, then the recovery', () => {
    expect(june25.chapters).toEqual([
      {
        id: 'tilt-1',
        kind: 'tilt',
        number: 1,
        title: 'The tilt',
        from: '2026-06-25T12:20:00.000Z',
        to: '2026-06-25T12:55:00.000Z',
        tradeIds: tilt,
        sentences: [
          {
            text: '5 impurities in 27 minutes, from 12:20 to 12:47: mostly 4 entries in the 12:30 USD news window, 4 oversized positions and 3 revenge trades.',
            links: [
              { phrase: '5 impurities', tradeIds: tilt },
              { phrase: '4 entries in the 12:30 USD news window', tradeIds: ['T-700043', 'T-700044', 'T-700045', 'T-700046'] },
              { phrase: '4 oversized positions', tradeIds: ['T-700044', 'T-700045', 'T-700046', 'T-700047'] },
              { phrase: '3 revenge trades', tradeIds: ['T-700045', 'T-700046', 'T-700047'] },
            ],
          },
          {
            // 934.04 + 484.72 + 509.08 + 209.10 — the 12:47 winner costs nothing.
            text: 'The day Karat fell from 24.0K to 11.9K, and the Gap bills $2,136.94 for it.',
            links: [{ phrase: '$2,136.94', tradeIds: ['T-700043', 'T-700044', 'T-700045', 'T-700046'] }],
          },
        ],
      },
      {
        id: 'recovery-1',
        kind: 'recovery',
        number: 2,
        title: 'Recovery',
        from: '2026-06-25T17:00:00.000Z',
        to: '2026-06-25T17:14:00.000Z',
        tradeIds: ['T-700050'],
        sentences: [
          {
            // 12:47 → 17:00.
            text: '1 trade after the tilt, at 17:00, 4h 13m after its last entry.',
            links: [{ phrase: '1 trade', tradeIds: ['T-700050'] }],
          },
          {
            text: 'It still carried an impurity — 1 oversized position — and the day Karat fell from 11.9K to 9.7K.',
            links: [{ phrase: '1 oversized position', tradeIds: ['T-700050'] }],
          },
        ],
      },
    ]);
  });

  it('bills Revenge, Market Conditions and Risk, each trade once', () => {
    expect(june25.receipt.lines.map((line) => [line.label, line.tradeIds, line.costMoney])).toEqual([
      ['Revenge', ['T-700045', 'T-700046'], 718.18],
      ['Market Conditions', ['T-700043', 'T-700044'], 1418.76],
      ['Risk', ['T-700050'], 69.88],
    ]);
    // 718.18 + 1,418.76 + 69.88.
    expect(june25.receipt.totalMoney).toBe(2206.82);
  });

  it('puts every trade in exactly one chapter, and every link phrase in its sentence', () => {
    expect(june25.chapters.flatMap((chapter) => chapter.tradeIds)).toEqual(june25.karatSeries.map((step) => step.tradeId));
    for (const chapter of june25.chapters) {
      for (const sentence of chapter.sentences) {
        for (const link of sentence.links) expect(sentence.text).toContain(link.phrase);
      }
    }
  });
});

describe('dayStory — every day of the demo', () => {
  const assay = getDemoAssay();
  const calendar = getDemoDataset().calendar;
  const days = computeReplay(assay.trades, assay.settings);

  it('covers each day’s trades once, in order, with one or two sentences a chapter', () => {
    for (const day of days) {
      const trades = assay.trades.filter((trade) => trade.isManual && trade.dayKey === day.date);
      const told = dayStory({ day, trades, calendar, settings: assay.settings });
      expect(told.chapters.flatMap((chapter) => chapter.tradeIds)).toEqual(day.trades.map((trade) => trade.tradeId));
      expect(told.chapters.filter((chapter) => chapter.kind === 'tilt')).toHaveLength(day.episodes.length);
      for (const chapter of told.chapters) {
        expect(chapter.sentences.length).toBeGreaterThanOrEqual(1);
        expect(chapter.sentences.length).toBeLessThanOrEqual(2);
        for (const sentence of chapter.sentences) {
          for (const link of sentence.links) expect(sentence.text).toContain(link.phrase);
        }
      }
      expect(told.receipt.totalMoney).toBeCloseTo(
        day.trades.reduce((total, trade) => total + trade.costMoney, 0),
        2,
      );
    }
  });
});
