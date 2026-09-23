/**
 * The Day Assay as a view (CLAUDE.md §6.11, §8.7): one day's `DayStory`,
 * joined trade by trade into the shape the panel draws.
 *
 * No figure is made here. The running Karat, the running P&L, the chapters and
 * their sentences, and the receipt are the engine's (`lib/engine/dayStory.ts`);
 * this only lines each trade's entry up with its close and names its chapter,
 * so the chart and the text can point at the same trade.
 *
 * Type-only engine imports: the client panel shares these shapes.
 */

import type { ChapterKind, DayReceipt, DayStory, StorySentence } from '@/lib/engine/dayStory';
import type { ImpurityKind } from '@/lib/engine/enrich';

export interface AssayTradeView {
  id: string;
  entryMs: number;
  closeMs: number;
  /** `12:20`, UTC. */
  entry: string;
  close: string;
  netMoney: number;
  rMultiple: number;
  /** The day's P&L once this trade had closed. */
  cumulative: number;
  karatBefore: number;
  karatAfter: number;
  impurities: ImpurityKind[];
  chapterId: string;
}

export interface AssayChapterView {
  id: string;
  kind: ChapterKind;
  number: number;
  title: string;
  fromMs: number;
  toMs: number;
  /** `12:20–12:55`, UTC. */
  range: string;
  tradeIds: string[];
  sentences: StorySentence[];
  /** The worst tilt of the whole history (the engine's `worstTiltEpisode`). */
  worstOverall: boolean;
}

export interface AssayNewsView {
  id: number;
  ms: number;
  time: string;
  name: string;
}

export interface DayAssayView {
  date: string;
  karat: number;
  tierLabel: string;
  tradeCount: number;
  impurityTradeCount: number;
  /** Manual trades only — the Day Assay is the trader's day. */
  netMoney: number;
  netR: number;
  /** EA trades the calendar counts that day, outside the day Karat. */
  eaTradeCount: number;
  /** In entry order. */
  trades: AssayTradeView[];
  news: AssayNewsView[];
  chapters: AssayChapterView[];
  receipt: DayReceipt;
}

export function buildDayAssayView(
  story: DayStory,
  options: { eaTradeCount?: number; worst?: { date: string; start: string } | null } = {},
): DayAssayView {
  const closes = new Map(story.pnl.map((point) => [point.tradeId, point]));
  const chapterOf = new Map(
    story.chapters.flatMap((chapter) => chapter.tradeIds.map((id) => [id, chapter.id] as const)),
  );
  const worst = options.worst ?? null;

  return {
    date: story.date,
    karat: story.karat,
    tierLabel: story.tier,
    tradeCount: story.tradeCount,
    impurityTradeCount: story.impurityTradeCount,
    netMoney: story.netMoney,
    netR: story.netR,
    eaTradeCount: options.eaTradeCount ?? 0,
    trades: story.karatSeries.map((step) => {
      const close = closes.get(step.tradeId);
      return {
        id: step.tradeId,
        entryMs: Date.parse(step.time),
        closeMs: Date.parse(close?.time ?? step.time),
        entry: step.time.slice(11, 16),
        close: (close?.time ?? step.time).slice(11, 16),
        netMoney: close?.netProfit ?? 0,
        rMultiple: close?.rMultiple ?? 0,
        cumulative: close?.cumulative ?? 0,
        karatBefore: step.karatBefore,
        karatAfter: step.karatAfter,
        impurities: step.impurities,
        chapterId: chapterOf.get(step.tradeId) ?? '',
      };
    }),
    news: story.news.map((event) => ({
      id: event.eventId,
      ms: Date.parse(event.time),
      time: event.time.slice(11, 16),
      name: event.name,
    })),
    chapters: story.chapters.map((chapter) => {
      const from = chapter.from.slice(11, 16);
      const to = chapter.to.slice(11, 16);
      return {
        id: chapter.id,
        kind: chapter.kind,
        number: chapter.number,
        title: chapter.title,
        fromMs: Date.parse(chapter.from),
        toMs: Date.parse(chapter.to),
        range: from === to ? from : `${from}–${to}`,
        tradeIds: chapter.tradeIds,
        sentences: chapter.sentences,
        worstOverall:
          chapter.kind === 'tilt' && worst !== null && worst.date === story.date && worst.start === chapter.from,
      };
    }),
    receipt: story.receipt,
  };
}

/**
 * A sentence cut into text and linked phrases, in order. Each link's phrase
 * is found once, after the previous one, so two phrases reading the same
 * (`1 trade`, `1 trade`) never land on the same words.
 */
export function sentenceParts(
  sentence: StorySentence,
): ({ text: string } | { text: string; tradeIds: string[]; key: string })[] {
  const parts: ({ text: string } | { text: string; tradeIds: string[]; key: string })[] = [];
  let cursor = 0;
  sentence.links.forEach((link, index) => {
    const at = sentence.text.indexOf(link.phrase, cursor);
    if (at === -1) return;
    if (at > cursor) parts.push({ text: sentence.text.slice(cursor, at) });
    parts.push({ text: link.phrase, tradeIds: link.tradeIds, key: `${index}:${link.phrase}` });
    cursor = at + link.phrase.length;
  });
  if (cursor < sentence.text.length) parts.push({ text: sentence.text.slice(cursor) });
  return parts;
}
