/**
 * The Vault (CLAUDE.md §8.7) and the Discipline Replay (§6.11), as a view.
 *
 * Every figure here is an engine output: a day is `stats.calendarDays` (the
 * whole account, as the engine's own comment says the Vault shows it) joined
 * with that day's `ReplayDay` (the manual trades, in order, re-scored after
 * each one). The only arithmetic is layout — which slot a day sits in, how
 * full its ingot is — and a month's summary, which is counts, sums, a best,
 * a worst and a mean of numbers the engine printed.
 *
 * Type-only imports from the engine, so the client screen can share the
 * layout helpers without the engine riding into the browser.
 */

import type { CalendarDay, ReplayDay, TiltEpisode } from '@/lib/engine';
import type { ImpurityKind } from '@/lib/engine/enrich';
import { addDays, dayKeyMs, mondayIndex, monthLabel } from '@/lib/dates';

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

/** How full an ingot is, and which way from its midline. */
export interface IngotFill {
  direction: 'up' | 'down' | 'none';
  /** 0–1 of the half-ingot on that side. */
  share: number;
}

export interface VaultDay {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  /** Day of the month. */
  day: number;
  /** 0 = Monday … 6 = Sunday. */
  column: number;
  /** `trading` has at least one closed trade; `quiet` is an empty slot in the history. */
  kind: 'trading' | 'quiet';
  tradeCount: number;
  manualTradeCount: number;
  /** Whole account, EAs included. */
  netMoney: number;
  netR: number;
  /** The day's manual trades, unweighted. `null` with none. */
  karat: number | null;
  /** Manual trades carrying at least one impurity. */
  impurityCount: number;
  fill: IngotFill;
}

/** `null` pads a week before the history starts or after it ends. */
export type VaultSlot = VaultDay | null;

export interface DayAmount {
  date: string;
  netMoney: number;
}

export interface MonthSummary {
  tradingDays: number;
  netR: number;
  netMoney: number;
  best: DayAmount | null;
  worst: DayAmount | null;
  /** Mean of the month's day Karats, days with manual trades only. */
  averageKarat: number | null;
}

export interface VaultMonth {
  /** `YYYY-MM`. */
  key: string;
  /** `July 2026`. */
  label: string;
  /** Monday-first rows of seven. */
  weeks: VaultSlot[][];
  summary: MonthSummary;
}

export interface ReplayRowView {
  id: string;
  index: number;
  /** `12:16`, UTC. */
  time: string;
  closeTime: string;
  direction: 'buy' | 'sell';
  volume: number;
  rMultiple: number;
  netProfit: number;
  impurities: ImpurityKind[];
  karatBefore: number;
  karatAfter: number;
  karatChange: number;
  /** What the Gap bills this trade, and to which line (§6.3). */
  costMoney: number;
  billedTo: string | null;
}

/** A tilt episode placed on the timeline: the rows it spans, inclusive. */
export interface TiltSpan {
  startIndex: number;
  endIndex: number;
  /** `12:12`, `12:42`, UTC. */
  start: string;
  end: string;
  durationMinutes: number;
  impurityTradeCount: number;
  karatBefore: number;
  karatAfter: number;
  karatDrop: number;
  costMoney: number;
  costR: number;
  /** The day's worst, when the day has more than one. */
  worstOfDay: boolean;
  /** The worst across the whole history. */
  worstOverall: boolean;
}

export interface ReplayDayView {
  date: string;
  tradeCount: number;
  impurityTradeCount: number;
  /** Manual trades only — the Replay is the trader's day. */
  netMoney: number;
  netR: number;
  karat: number;
  rows: ReplayRowView[];
  spans: TiltSpan[];
  /** The EA trades the calendar counts that day, outside the day Karat. */
  eaTradeCount: number;
}

export interface VaultView {
  currency: string;
  firstDate: string;
  lastDate: string;
  months: VaultMonth[];
  /** The largest day, either way — what a full half-ingot stands for. */
  maxAbsMoney: number;
  replays: Record<string, ReplayDayView>;
  /** Where the worst tilt episode of the history happened. */
  worst: { date: string; start: string } | null;
  /** The engine's sentence for each impurity (§6.5), as the Replay prints it. */
  reasons: Partial<Record<ImpurityKind, string>>;
}

/* -------------------------------------------------------------------------
 * The ingot
 * ---------------------------------------------------------------------- */

/** The smallest fill drawn for a day that moved at all: a sliver still reads. */
export const MIN_FILL_SHARE = 0.08;

/**
 * A day's fill: jade above the midline for a profit, oxblood below it for a
 * loss, linear in money against the largest day of the history. A day that
 * closed flat has no fill.
 */
export function ingotFill(netMoney: number, maxAbsMoney: number): IngotFill {
  if (!Number.isFinite(netMoney) || netMoney === 0 || !(maxAbsMoney > 0)) {
    return { direction: 'none', share: 0 };
  }
  const share = Math.min(Math.max(Math.abs(netMoney) / maxAbsMoney, MIN_FILL_SHARE), 1);
  return { direction: netMoney > 0 ? 'up' : 'down', share: Math.round(share * 1000) / 1000 };
}

/** The ingot seen front-on: a trapezoid, narrower at the top face. */
export const INGOT = { width: 60, height: 34, inset: 7, margin: 3 } as const;

/** x of the ingot's left edge at height y (the right edge mirrors it). */
function leftEdge(y: number): number {
  return INGOT.inset * (1 - y / INGOT.height);
}

/** The body's outline, as SVG polygon points. */
export function ingotBody(): string {
  return `${INGOT.inset},0 ${INGOT.width - INGOT.inset},0 ${INGOT.width},${INGOT.height} 0,${INGOT.height}`;
}

/**
 * The fill band as a polygon inside the body: from the midline up (profit) or
 * down (loss), its sides following the body's slope so the metal stays
 * inside the bar at every height.
 */
export function ingotBand(fill: IngotFill): string | null {
  if (fill.direction === 'none' || fill.share <= 0) return null;
  const mid = INGOT.height / 2;
  const reach = (mid - INGOT.margin) * fill.share;
  const [y1, y2] = fill.direction === 'up' ? [mid - reach, mid] : [mid, mid + reach];
  const points: [number, number][] = [
    [leftEdge(y1), y1],
    [INGOT.width - leftEdge(y1), y1],
    [INGOT.width - leftEdge(y2), y2],
    [leftEdge(y2), y2],
  ];
  return points.map(([x, y]) => `${round2(x)},${round2(y)}`).join(' ');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The engraving's tone, in the gold family by tier (§6.2): a Pure or Refined
 * day is struck bright, an impure one dull. A tier is not a P&L, so never
 * jade or oxblood.
 */
export type KaratTone = 'fine' | 'solid' | 'mixed' | 'raw' | 'none';

export function karatTone(karat: number | null): KaratTone {
  if (karat === null || !Number.isFinite(karat)) return 'none';
  if (karat >= 22) return 'fine';
  if (karat >= 18) return 'solid';
  if (karat >= 14) return 'mixed';
  return 'raw';
}

/* -------------------------------------------------------------------------
 * Shelves
 * ---------------------------------------------------------------------- */

/**
 * One slot per day from `firstDate` to `lastDate`, grouped into months, each
 * month into Monday-first weeks. Every week has seven slots so the weekday
 * columns line up on every shelf; slots before the 1st, after the month's
 * last day, or outside the history are `null`.
 */
export function buildShelves(days: readonly VaultDay[]): VaultMonth[] {
  const months = new Map<string, VaultDay[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    const list = months.get(key);
    if (list === undefined) months.set(key, [day]);
    else list.push(day);
  }

  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthDays]) => {
      const ordered = monthDays.slice().sort((a, b) => a.date.localeCompare(b.date));
      const weeks: VaultSlot[][] = [];
      let week: VaultSlot[] = new Array<VaultSlot>(7).fill(null);
      let weekStart: string | null = null;
      for (const day of ordered) {
        const monday = addDays(day.date, -day.column);
        if (weekStart !== null && monday !== weekStart) {
          weeks.push(week);
          week = new Array<VaultSlot>(7).fill(null);
        }
        weekStart = monday;
        week[day.column] = day;
      }
      if (weekStart !== null) weeks.push(week);
      return { key, label: monthLabel(key), weeks, summary: monthSummary(ordered) };
    });
}

/** Counts, sums, the best and worst day, and the mean day Karat — no new metric. */
export function monthSummary(days: readonly VaultDay[]): MonthSummary {
  const trading = days.filter((day) => day.kind === 'trading');
  let best: DayAmount | null = null;
  let worst: DayAmount | null = null;
  for (const day of trading) {
    if (best === null || day.netMoney > best.netMoney) best = { date: day.date, netMoney: day.netMoney };
    if (worst === null || day.netMoney < worst.netMoney) worst = { date: day.date, netMoney: day.netMoney };
  }
  const karats = trading.flatMap((day) => (day.karat === null ? [] : [day.karat]));
  return {
    tradingDays: trading.length,
    netR: round2(trading.reduce((total, day) => total + day.netR, 0)),
    netMoney: round2(trading.reduce((total, day) => total + day.netMoney, 0)),
    best,
    worst,
    averageKarat:
      karats.length === 0
        ? null
        : Math.round((karats.reduce((total, karat) => total + karat, 0) / karats.length) * 10) / 10,
  };
}

/* -------------------------------------------------------------------------
 * The keyboard
 * ---------------------------------------------------------------------- */

/**
 * Where an arrow key takes the selection: a day either side, a week up or
 * down (the same weekday, one shelf row over), Home and End to the ends of the
 * history. Clamped — the selection never leaves the Vault. `null` for a key
 * the calendar does not use.
 */
export function moveDate(date: string, key: string, firstDate: string, lastDate: string): string | null {
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  let next: string;
  if (key === 'Home') next = firstDate;
  else if (key === 'End') next = lastDate;
  else if (key in step) next = addDays(date, step[key] ?? 0);
  else return null;
  if (dayKeyMs(next) < dayKeyMs(firstDate)) return firstDate;
  if (dayKeyMs(next) > dayKeyMs(lastDate)) return lastDate;
  return next;
}

/* -------------------------------------------------------------------------
 * The Replay
 * ---------------------------------------------------------------------- */

/** The running Karat's lane: 0K at the left edge, 24K at the right, in percent. */
export function karatX(karat: number): number {
  return round2((Math.min(Math.max(karat, 0), 24) / 24) * 100);
}

/**
 * One row's piece of the running-Karat line, in a 100 × 100 box stretched to
 * the row. It enters at the top at the Karat before the trade, falls (or
 * rises) to the Karat after it by the row's middle, and leaves at the bottom
 * where the next row picks it up — so rows of any height join into one line.
 */
export function replaySegment(before: number, after: number): string {
  const xb = karatX(before);
  const xa = karatX(after);
  return `M${xb} 0 L${xb} 22 L${xa} 50 L${xa} 100`;
}

/** Where a tilt episode's bracket opens and closes, and which one is worst. */
export function tiltSpans(
  day: ReplayDay,
  worstOverall: { date: string; start: string } | null = null,
): TiltSpan[] {
  const indexOf = new Map(day.trades.map((trade, index) => [trade.tradeId, index]));
  const worstOfDay = pickWorst(day.episodes);

  return day.episodes.flatMap((episode) => {
    const first = episode.tradeIds[0];
    const last = episode.tradeIds[episode.tradeIds.length - 1];
    const startIndex = first === undefined ? undefined : indexOf.get(first);
    const endIndex = last === undefined ? undefined : indexOf.get(last);
    if (startIndex === undefined || endIndex === undefined) return [];
    return [
      {
        startIndex,
        endIndex,
        start: episode.start.slice(11, 16),
        end: episode.end.slice(11, 16),
        durationMinutes: episode.durationMinutes,
        impurityTradeCount: episode.impurityTradeCount,
        karatBefore: episode.karatBefore,
        karatAfter: episode.karatAfter,
        karatDrop: episode.karatDrop,
        costMoney: episode.costMoney,
        costR: episode.costR,
        worstOfDay: day.episodes.length > 1 && episode === worstOfDay,
        worstOverall:
          worstOverall !== null && worstOverall.date === day.date && worstOverall.start === episode.start,
      },
    ];
  });
}

/** The engine's own ordering (`worstTiltEpisode`): Karat drop, then cost. */
function pickWorst(episodes: readonly TiltEpisode[]): TiltEpisode | null {
  let worst: TiltEpisode | null = null;
  for (const episode of episodes) {
    if (
      worst === null ||
      episode.karatDrop > worst.karatDrop ||
      (episode.karatDrop === worst.karatDrop && episode.costMoney > worst.costMoney)
    ) {
      worst = episode;
    }
  }
  return worst;
}

export function buildReplayDayView(
  day: ReplayDay,
  calendarDay: CalendarDay | undefined,
  options: { worst?: { date: string; start: string } | null; billedTo?: (pillar: string) => string } = {},
): ReplayDayView {
  return {
    date: day.date,
    tradeCount: day.tradeCount,
    impurityTradeCount: day.impurityTradeCount,
    netMoney: day.netMoney,
    netR: day.netR,
    karat: day.karat,
    rows: day.trades.map((trade) => ({
      id: trade.tradeId,
      index: trade.index,
      time: trade.openTime.slice(11, 16),
      closeTime: trade.closeTime.slice(11, 16),
      direction: trade.direction,
      volume: trade.volume,
      rMultiple: trade.rMultiple,
      netProfit: trade.netProfit,
      impurities: trade.impurities.map((impurity) => impurity.kind),
      karatBefore: trade.karatBefore,
      karatAfter: trade.karatAfter,
      karatChange: trade.karatChange,
      costMoney: trade.costMoney,
      billedTo:
        trade.costPillar === null || trade.costMoney <= 0
          ? null
          : (options.billedTo?.(trade.costPillar) ?? trade.costPillar),
    })),
    spans: tiltSpans(day, options.worst ?? null),
    eaTradeCount: calendarDay === undefined ? 0 : calendarDay.tradeCount - calendarDay.manualTradeCount,
  };
}

/* -------------------------------------------------------------------------
 * The whole view
 * ---------------------------------------------------------------------- */

export interface VaultSources {
  calendarDays: readonly CalendarDay[];
  replay: readonly ReplayDay[];
  /** First and last day of the history, `YYYY-MM-DD`. */
  firstDate: string;
  lastDate: string;
  currency: string;
  worst: { date: string; start: string } | null;
  billedTo: (pillar: string) => string;
}

export function buildVaultView(sources: VaultSources): VaultView {
  const calendar = new Map(sources.calendarDays.map((day) => [day.date, day]));
  const replayByDate = new Map(sources.replay.map((day) => [day.date, day]));
  const maxAbsMoney = sources.calendarDays.reduce((max, day) => Math.max(max, Math.abs(day.netMoney)), 0);

  const days: VaultDay[] = [];
  for (let date = sources.firstDate; dayKeyMs(date) <= dayKeyMs(sources.lastDate); date = addDays(date, 1)) {
    const cal = calendar.get(date);
    const replay = replayByDate.get(date);
    const traded = cal !== undefined && cal.tradeCount > 0;
    days.push({
      date,
      day: Number(date.slice(8, 10)),
      column: mondayIndex(date),
      kind: traded ? 'trading' : 'quiet',
      tradeCount: cal?.tradeCount ?? 0,
      manualTradeCount: cal?.manualTradeCount ?? 0,
      netMoney: cal?.netMoney ?? 0,
      netR: cal?.netR ?? 0,
      karat: cal?.karat ?? null,
      impurityCount: replay?.impurityTradeCount ?? 0,
      fill: ingotFill(cal?.netMoney ?? 0, maxAbsMoney),
    });
  }

  const reasons: Partial<Record<ImpurityKind, string>> = {};
  const replays: Record<string, ReplayDayView> = {};
  for (const day of sources.replay) {
    for (const trade of day.trades) {
      for (const impurity of trade.impurities) reasons[impurity.kind] ??= impurity.reason;
    }
    replays[day.date] = buildReplayDayView(day, calendar.get(day.date), {
      worst: sources.worst,
      billedTo: sources.billedTo,
    });
  }

  return {
    currency: sources.currency,
    firstDate: sources.firstDate,
    lastDate: sources.lastDate,
    months: buildShelves(days),
    maxAbsMoney,
    replays,
    worst: sources.worst,
    reasons,
  };
}
