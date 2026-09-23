/**
 * The Day Assay's story (CLAUDE.md §6.11, §8.7) — one day, told in chapters.
 *
 * The Discipline Replay (`replay.ts`) re-scores a day after every trade and
 * finds its tilt episodes. This module turns that into what the Vault's Day
 * Assay draws and reads: the running day Karat as a series, the day's P&L as a
 * running total, the high-impact USD releases the day held, the Gap's bill for
 * the day, and the day split into **chapters** by fixed rules — never by a
 * model, and never with a number the engine did not produce.
 *
 * Chapters, in entry order, each only when it has trades:
 *
 * - **The open** — the trades before the first impurity. A clean day is one
 *   chapter, all of it the open.
 * - **The tilt** — each tilt episode (§6.11), from its first impurity to its
 *   last, clean trades inside it included.
 * - **Recovery** — the trades after a tilt, up to the next tilt or the end of
 *   the day. A recovery can still carry impurities; the sentence says so.
 * - **The slip** — impurities that never chained into a tilt: from the first
 *   of them to the last, before any tilt (or on a day with none). The four
 *   chapters above leave these trades unnamed, so they get a fifth.
 * - **The close** — the clean trades after the last slip, to the end of the
 *   day.
 *
 * Every trade of the day is in exactly one chapter.
 *
 * Sentences are templates. Every figure in them is a count of the day's
 * trades, a clock time the trades carry, a day Karat the Replay printed, or a
 * sum of P&L and Gap cost the engine attributes — and every phrase that names
 * trades carries their ids, so the page can point at them.
 */

import { formatDuration, formatKarat, formatMoney, formatR } from '@/lib/format';
import type { EnrichedTrade, ImpurityKind } from './enrich';
import { attributeCost, GAP_PILLAR_LABELS, GAP_PRIORITY } from './gap';
import type { GapPillar } from './gap';
import { tierFor } from './karat';
import { round, sum } from './math';
import type { ReplayDay } from './replay';
import { DAY_OPENING_KARAT } from './replay';
import type { EngineSettings } from './settings';
import { DAY_MS } from './time';
import type { NewsEvent } from './types';

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

export type ChapterKind = 'open' | 'slip' | 'tilt' | 'recovery' | 'close';

/** A phrase inside a sentence that names trades. `phrase` occurs verbatim in the text. */
export interface StoryLink {
  phrase: string;
  tradeIds: string[];
}

export interface StorySentence {
  text: string;
  links: StoryLink[];
}

export interface DayChapter {
  /** `open`, `tilt-1`, `recovery-1`, `slip-1`, `close`. */
  id: string;
  kind: ChapterKind;
  /** 1-based, in the order the day ran. */
  number: number;
  title: string;
  /** Entry of the chapter's first trade. */
  from: string;
  /** Latest close among the chapter's trades. */
  to: string;
  tradeIds: string[];
  sentences: StorySentence[];
}

/** The running day Karat, one step per trade, at the trade's entry. */
export interface KaratStep {
  tradeId: string;
  /** Entry time, ISO. */
  time: string;
  karatBefore: number;
  karatAfter: number;
  impure: boolean;
  impurities: ImpurityKind[];
}

/** The day's P&L as trades closed, in close order. */
export interface PnlPoint {
  tradeId: string;
  /** Close time, ISO. */
  time: string;
  netProfit: number;
  rMultiple: number;
  /** Net P&L of every trade closed so far, this one included. */
  cumulative: number;
}

export interface DayNews {
  eventId: number;
  time: string;
  name: string;
}

export interface ReceiptLine {
  pillar: GapPillar;
  label: string;
  tradeIds: string[];
  costMoney: number;
  costR: number;
}

export interface DayReceipt {
  /** Pillars that billed something, in the Gap's priority order. */
  lines: ReceiptLine[];
  totalMoney: number;
  totalR: number;
  tradeIds: string[];
}

export interface DayStory {
  date: string;
  /** The day's closing Karat (the Vault's stamp) and its tier. */
  karat: number;
  tier: string;
  tradeCount: number;
  impurityTradeCount: number;
  netMoney: number;
  netR: number;
  karatSeries: KaratStep[];
  pnl: PnlPoint[];
  news: DayNews[];
  chapters: DayChapter[];
  receipt: DayReceipt;
}

export interface DayStoryInput {
  /** The Replay for the day: running Karat and tilt episodes. */
  day: ReplayDay;
  /** The day's manual trades, enriched (any order; matched to the Replay by id). */
  trades: readonly EnrichedTrade[];
  /** The calendar. Only high-impact USD releases on the day are kept. */
  calendar: readonly NewsEvent[];
  settings: EngineSettings;
  currency?: string;
}

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** `a, b and c`. */
function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

function clock(iso: string): string {
  return iso.slice(11, 16);
}

/** `from 12:20 to 12:47`, or `at 12:20` when both ends are the same minute. */
function span(fromIso: string, toIso: string): string {
  const a = clock(fromIso);
  const b = clock(toIso);
  return a === b ? `at ${a}` : `from ${a} to ${b}`;
}

const ORDINAL = ['', 'second', 'third', 'fourth', 'fifth', 'sixth'] as const;

function titleFor(kind: ChapterKind, occurrence: number): string {
  switch (kind) {
    case 'open':
      return 'The open';
    case 'close':
      return 'The close';
    case 'recovery':
      return 'Recovery';
    case 'tilt':
      return occurrence === 1 ? 'The tilt' : `The ${ORDINAL[occurrence - 1] ?? `${occurrence}th`} tilt`;
    case 'slip':
      return occurrence === 1 ? 'The slip' : 'Another slip';
  }
}

/** The day Karat moving across a stretch, in words. */
function karatMove(before: number, after: number): string {
  if (after > before) return `climbed from ${formatKarat(before)} to ${formatKarat(after)}`;
  if (after < before) return `fell from ${formatKarat(before)} to ${formatKarat(after)}`;
  return `held at ${formatKarat(after)}`;
}

/* -------------------------------------------------------------------------
 * Impurity phrases
 * ---------------------------------------------------------------------- */

interface Phrase {
  text: string;
  tradeIds: string[];
  /** Sort key: more trades first, then the engine's impurity order. */
  count: number;
  order: number;
}

const KIND_ORDER: readonly ImpurityKind[] = [
  'revenge',
  'news',
  'rollover',
  'oversized',
  'noStop',
  'stopWidened',
  'exitOverrun',
];

const KIND_WORDS: Record<Exclude<ImpurityKind, 'news'>, (count: number) => string> = {
  revenge: (count) => plural(count, 'revenge trade'),
  rollover: (count) => plural(count, 'entry in the rollover window', 'entries in the rollover window'),
  oversized: (count) => plural(count, 'oversized position'),
  noStop: (count) => plural(count, 'trade without a stop', 'trades without a stop'),
  stopWidened: (count) => plural(count, 'widened stop'),
  exitOverrun: (count) => plural(count, 'overrun loss', 'overrun losses'),
};

/**
 * One phrase per impurity kind among these trades — news split by release,
 * so the phrase can name the window (`2 entries in the 12:30 USD news window`).
 */
function impurityPhrases(
  trades: readonly EnrichedTrade[],
  newsById: ReadonlyMap<number, DayNews>,
): Phrase[] {
  const phrases: Phrase[] = [];
  KIND_ORDER.forEach((kind, order) => {
    const carrying = trades.filter((trade) => trade.impurities.includes(kind));
    if (carrying.length === 0) return;
    if (kind !== 'news') {
      phrases.push({
        text: KIND_WORDS[kind](carrying.length),
        tradeIds: carrying.map((trade) => trade.id),
        count: carrying.length,
        order,
      });
      return;
    }
    const byRelease = new Map<string, EnrichedTrade[]>();
    for (const trade of carrying) {
      const release =
        trade.nearestNewsEventId === null ? undefined : newsById.get(trade.nearestNewsEventId);
      const key = release === undefined ? '' : clock(release.time);
      const list = byRelease.get(key);
      if (list === undefined) byRelease.set(key, [trade]);
      else list.push(trade);
    }
    for (const [time, group] of [...byRelease.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const window = time === '' ? 'a USD news window' : `the ${time} USD news window`;
      phrases.push({
        text: plural(group.length, `entry in ${window}`, `entries in ${window}`),
        tradeIds: group.map((trade) => trade.id),
        count: group.length,
        order,
      });
    }
  });
  return phrases.sort((a, b) => b.count - a.count || a.order - b.order);
}

/** The three largest impurity phrases. */
function topPhrases(phrases: readonly Phrase[]): Phrase[] {
  return phrases.slice(0, 3);
}

/** The phrases in a list, `mostly …` when some were left out. */
function phraseList(phrases: readonly Phrase[]): string {
  const top = topPhrases(phrases);
  return `${phrases.length > top.length ? 'mostly ' : ''}${listJoin(top.map((entry) => entry.text))}`;
}

/* -------------------------------------------------------------------------
 * Chapters
 * ---------------------------------------------------------------------- */

interface Range {
  kind: ChapterKind;
  start: number;
  end: number;
  /** Index into the day's episodes, for a tilt. */
  episode?: number;
}

/**
 * The day's chapters as index ranges over its trades in entry order.
 * Pure structure: which trade belongs to which chapter.
 */
export function chapterRanges(
  impure: readonly boolean[],
  tilts: readonly { start: number; end: number }[],
): { kind: ChapterKind; start: number; end: number; episode?: number }[] {
  const n = impure.length;
  const ranges: Range[] = [];
  const firstImpure = impure.indexOf(true);
  let cursor = firstImpure === -1 ? n : firstImpure;
  if (cursor > 0) ranges.push({ kind: 'open', start: 0, end: cursor - 1 });

  let next = 0;
  let afterTilt = false;
  while (cursor < n) {
    const tilt = tilts[next];
    if (tilt !== undefined && cursor === tilt.start) {
      ranges.push({ kind: 'tilt', start: tilt.start, end: tilt.end, episode: next });
      cursor = tilt.end + 1;
      next += 1;
      afterTilt = true;
      continue;
    }
    const stretchEnd = tilt === undefined ? n - 1 : tilt.start - 1;
    if (afterTilt) {
      ranges.push({ kind: 'recovery', start: cursor, end: stretchEnd });
      cursor = stretchEnd + 1;
      afterTilt = false;
      continue;
    }
    // Impurities that never chained into a tilt. Before a tilt, the slip runs
    // up to it; at the end of the day, the clean trades after the last
    // impurity are the close.
    if (tilt !== undefined) {
      ranges.push({ kind: 'slip', start: cursor, end: stretchEnd });
    } else {
      let lastImpure = cursor;
      for (let index = cursor; index <= stretchEnd; index += 1) {
        if (impure[index] === true) lastImpure = index;
      }
      ranges.push({ kind: 'slip', start: cursor, end: lastImpure });
      if (lastImpure < stretchEnd) ranges.push({ kind: 'close', start: lastImpure + 1, end: stretchEnd });
    }
    cursor = stretchEnd + 1;
  }
  return ranges;
}

/* -------------------------------------------------------------------------
 * The story
 * ---------------------------------------------------------------------- */

export function dayStory(input: DayStoryInput): DayStory {
  const { day, settings } = input;
  const currency = input.currency ?? 'USD';
  const money = (value: number, signed = false) => formatMoney(value, { currency, signed });

  const byId = new Map(input.trades.map((trade) => [trade.id, trade]));
  const replayTrades = day.trades.filter((trade) => byId.has(trade.tradeId));
  const ordered = replayTrades.flatMap((trade) => {
    const enriched = byId.get(trade.tradeId);
    return enriched === undefined ? [] : [enriched];
  });

  // The day's high-impact USD releases, and any release a trade of the day
  // was measured against (a trade at 00:05 can sit in last night's window).
  const dayStart = Date.parse(`${day.date}T00:00:00.000Z`);
  const referenced = new Set(ordered.flatMap((trade) => (trade.nearestNewsEventId === null ? [] : [trade.nearestNewsEventId])));
  const news: DayNews[] = input.calendar
    .filter((event) => event.currency === 'USD' && event.importance === 'high')
    .filter((event) => {
      const ms = Date.parse(event.time);
      return (ms >= dayStart && ms < dayStart + DAY_MS) || referenced.has(event.eventId);
    })
    .map((event) => ({ eventId: event.eventId, time: event.time, name: event.name }))
    .sort((a, b) => a.time.localeCompare(b.time) || a.eventId - b.eventId);
  const newsById = new Map(news.map((event) => [event.eventId, event]));

  const karatSeries: KaratStep[] = replayTrades.map((trade) => ({
    tradeId: trade.tradeId,
    time: trade.openTime,
    karatBefore: trade.karatBefore,
    karatAfter: trade.karatAfter,
    impure: trade.impurities.length > 0,
    impurities: trade.impurities.map((impurity) => impurity.kind),
  }));

  let running = 0;
  const pnl: PnlPoint[] = ordered
    .slice()
    .sort((a, b) => a.closeTimeMs - b.closeTimeMs || a.id.localeCompare(b.id))
    .map((trade) => {
      running = round(running + trade.netProfit, 2);
      return {
        tradeId: trade.id,
        time: trade.closeTime,
        netProfit: trade.netProfit,
        rMultiple: trade.rMultiple,
        cumulative: running,
      };
    });

  // The Gap's own attribution, trade by trade (§6.3).
  const costs = new Map(
    ordered.flatMap((trade) => {
      const cost = attributeCost(trade, settings);
      return cost === null ? [] : [[trade.id, cost] as const];
    }),
  );
  const lines: ReceiptLine[] = GAP_PRIORITY.flatMap((pillar) => {
    const billed = [...costs.values()].filter((cost) => cost.pillar === pillar);
    if (billed.length === 0) return [];
    return [
      {
        pillar,
        label: GAP_PILLAR_LABELS[pillar],
        tradeIds: billed.map((cost) => cost.tradeId),
        costMoney: round(sum(billed.map((cost) => cost.costMoney)), 2),
        costR: round(sum(billed.map((cost) => cost.costR)), 2),
      },
    ];
  });
  const receipt: DayReceipt = {
    lines,
    totalMoney: round(sum(lines.map((line) => line.costMoney)), 2),
    totalR: round(sum(lines.map((line) => line.costR)), 2),
    tradeIds: lines.flatMap((line) => line.tradeIds),
  };

  // Chapters.
  const indexOf = new Map(ordered.map((trade, index) => [trade.id, index]));
  const tilts = day.episodes.flatMap((episode) => {
    const start = indexOf.get(episode.tradeIds[0] ?? '');
    const end = indexOf.get(episode.tradeIds[episode.tradeIds.length - 1] ?? '');
    return start === undefined || end === undefined ? [] : [{ start, end }];
  });
  const ranges = chapterRanges(
    ordered.map((trade) => trade.impurities.length > 0),
    tilts,
  );

  const seen: Partial<Record<ChapterKind, number>> = {};
  const chapters: DayChapter[] = ranges.map((range, position) => {
    const occurrence = (seen[range.kind] ?? 0) + 1;
    seen[range.kind] = occurrence;
    const trades = ordered.slice(range.start, range.end + 1);
    const steps = replayTrades.slice(range.start, range.end + 1);
    const first = trades[0];
    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];
    if (first === undefined || firstStep === undefined || lastStep === undefined) {
      throw new RangeError('day chapter built from an empty range');
    }
    const lastClose = trades.reduce((latest, trade) => (trade.closeTimeMs > latest.closeTimeMs ? trade : latest), first);
    const lastEntry = trades[trades.length - 1] ?? first;
    const ids = trades.map((trade) => trade.id);
    const impureTrades = trades.filter((trade) => trade.impurities.length > 0);
    const impureIds = impureTrades.map((trade) => trade.id);
    const chapterMoney = round(sum(trades.map((trade) => trade.netProfit)), 2);
    const chapterR = round(sum(trades.map((trade) => trade.rMultiple)), 2);
    const billedIds = ids.filter((id) => costs.has(id));
    const billed = round(sum(billedIds.map((id) => costs.get(id)?.costMoney ?? 0)), 2);
    const move = karatMove(firstStep.karatBefore, lastStep.karatAfter);

    const sentences: StorySentence[] = [];
    const they = trades.length === 1 ? 'It' : 'They';
    const made = `${chapterMoney < 0 ? 'lost' : 'made'} ${money(chapterMoney, true)} (${formatR(chapterR)})`;

    switch (range.kind) {
      case 'open': {
        const whole = range.end === ordered.length - 1;
        const phrase = plural(trades.length, whole ? 'trade' : 'clean trade');
        const when = span(first.openTime, lastEntry.openTime);
        sentences.push({
          text: whole
            ? `${phrase} ${when}, ${trades.length === 1 ? 'clean' : 'every one clean'}.`
            : `${phrase} before the first impurity, ${when}.`,
          links: [{ phrase, tradeIds: ids }],
        });
        sentences.push({ text: `${they} ${made}, and the day Karat ${move}.`, links: [] });
        break;
      }
      case 'close': {
        const phrase = plural(trades.length, 'clean trade');
        sentences.push({
          text: `${phrase} to finish, ${span(first.openTime, lastEntry.openTime)}.`,
          links: [{ phrase, tradeIds: ids }],
        });
        sentences.push({
          text: `${they} ${made}, and the day closed at ${formatKarat(lastStep.karatAfter)}.`,
          links: [],
        });
        break;
      }
      case 'tilt': {
        const episode = day.episodes[range.episode ?? 0];
        const count = episode?.impurityTradeCount ?? impureTrades.length;
        const phrase = plural(count, 'impurity', 'impurities');
        const minutes = Math.round(episode?.durationMinutes ?? 0);
        const phrases = impurityPhrases(impureTrades, newsById);
        const top = topPhrases(phrases);
        sentences.push({
          text: `${phrase} in ${plural(minutes, 'minute')}, ${span(first.openTime, lastEntry.openTime)}: ${phraseList(phrases)}.`,
          links: [
            { phrase, tradeIds: episode?.tradeIds ?? impureIds },
            ...top.map((entry) => ({ phrase: entry.text, tradeIds: entry.tradeIds })),
          ],
        });
        const cost = episode?.costMoney ?? billed;
        const costPhrase = money(cost);
        sentences.push({
          text:
            cost > 0
              ? `The day Karat ${karatMove(episode?.karatBefore ?? firstStep.karatBefore, episode?.karatAfter ?? lastStep.karatAfter)}, and the Gap bills ${costPhrase} for it.`
              : `The day Karat ${karatMove(episode?.karatBefore ?? firstStep.karatBefore, episode?.karatAfter ?? lastStep.karatAfter)}; the Gap bills nothing for it.`,
          links: cost > 0 ? [{ phrase: costPhrase, tradeIds: billedIds }] : [],
        });
        break;
      }
      case 'recovery': {
        const phrase = plural(trades.length, 'trade');
        const pause = firstStep.minutesSincePrevious;
        const after = pause === null ? '' : `${formatDuration(pause * 60)} after its last entry`;
        sentences.push({
          text:
            trades.length === 1
              ? `${phrase} after the tilt, at ${clock(first.openTime)}${after === '' ? '' : `, ${after}`}.`
              : `${phrase} after the tilt, ${span(first.openTime, lastEntry.openTime)}${after === '' ? '' : `; the first came ${after}`}.`,
          links: [{ phrase, tradeIds: ids }],
        });
        if (impureTrades.length === 0) {
          sentences.push({
            text: `All clean: ${they.toLowerCase()} ${made}, and the day Karat ${move}.`,
            links: [],
          });
        } else {
          const phrases = impurityPhrases(impureTrades, newsById);
          const top = topPhrases(phrases);
          const lead =
            trades.length === 1
              ? 'It still carried an impurity'
              : `${impureTrades.length} of them still carried an impurity`;
          sentences.push({
            text: `${lead} — ${phraseList(phrases)} — and the day Karat ${move}.`,
            links: top.map((entry) => ({ phrase: entry.text, tradeIds: entry.tradeIds })),
          });
        }
        break;
      }
      case 'slip': {
        const phrase = plural(impureTrades.length, 'impurity', 'impurities');
        const phrases = impurityPhrases(impureTrades, newsById);
        const top = topPhrases(phrases);
        const where = impureTrades.length === 1 ? `at ${clock(impureTrades[0]?.openTime ?? first.openTime)}` : span(first.openTime, lastEntry.openTime);
        sentences.push({
          text: `${phrase} ${where} that never chained into a tilt: ${phraseList(phrases)}.`,
          links: [
            { phrase, tradeIds: impureIds },
            ...top.map((entry) => ({ phrase: entry.text, tradeIds: entry.tradeIds })),
          ],
        });
        const costPhrase = money(billed);
        sentences.push({
          text:
            billed > 0
              ? `The day Karat ${move}, and the Gap bills ${costPhrase} for it.`
              : `The day Karat ${move}; the Gap bills nothing for it.`,
          links: billed > 0 ? [{ phrase: costPhrase, tradeIds: billedIds }] : [],
        });
        break;
      }
    }

    return {
      id: range.kind === 'open' || range.kind === 'close' ? range.kind : `${range.kind}-${occurrence}`,
      kind: range.kind,
      number: position + 1,
      title: titleFor(range.kind, occurrence),
      from: first.openTime,
      to: lastClose.closeTime,
      tradeIds: ids,
      sentences,
    };
  });

  return {
    date: day.date,
    karat: ordered.length === 0 ? DAY_OPENING_KARAT : day.karat,
    tier: tierFor(ordered.length === 0 ? DAY_OPENING_KARAT : day.karat).label,
    tradeCount: day.tradeCount,
    impurityTradeCount: day.impurityTradeCount,
    netMoney: day.netMoney,
    netR: day.netR,
    karatSeries,
    pnl,
    news,
    chapters,
    receipt,
  };
}
