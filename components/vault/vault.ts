/**
 * The Vault (CLAUDE.md §8.7) and its Day Assay (§6.11), as a view.
 *
 * Every figure here is an engine output: a day is `stats.calendarDays` (the
 * whole account, as the engine's own comment says the Vault shows it) joined
 * with that day's `DayStory` (the manual trades, in order, re-scored after
 * each one, told in chapters). The only arithmetic is layout — which slot a
 * day sits in, how long its assay strip is — and a month's summary, which is
 * counts, sums, a best, a worst and a mean of numbers the engine printed.
 *
 * Type-only imports from the engine, so the client screen can share the
 * layout helpers without the engine riding into the browser.
 */

import type { CalendarDay, DayStory, SessionDefinition } from '@/lib/engine';
import { addDays, dayKeyMs, mondayIndex, monthLabel } from '@/lib/dates';
import type { AssayStrip, TierKey } from '@/components/viz/ingot';
import { assayStrip, tierKey } from '@/components/viz/ingot';
import type { DayAssayView } from './dayAssay';
import { buildDayAssayView } from './dayAssay';

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

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
  /** The engine's tier for that Karat (§6.2), and the metal the ingot is cast in. */
  tierLabel: string | null;
  tier: TierKey | null;
  /** Manual trades carrying at least one impurity. */
  impurityCount: number;
  /** The P&L strip under the bar, against the month's largest day. */
  strip: AssayStrip;
  /** The month's best or worst day by P&L carries a hallmark. */
  mark: 'best' | 'worst' | null;
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
  /** The engine's tier for that mean, for its stamp. */
  averageTier: TierKey | null;
}

export interface VaultMonth {
  /** `YYYY-MM`. */
  key: string;
  /** `July 2026`. */
  label: string;
  /** Monday-first rows of seven. */
  weeks: VaultSlot[][];
  summary: MonthSummary;
  /** The largest day of the month, either way — what a full strip stands for. */
  maxAbsMoney: number;
}

export interface VaultView {
  currency: string;
  firstDate: string;
  lastDate: string;
  months: VaultMonth[];
  /** Every day with manual trades, told as a Day Assay. */
  assays: Record<string, DayAssayView>;
  /** Where the worst tilt episode of the history happened. */
  worst: { date: string; start: string } | null;
  /** The sessions (§5), for the Day Assay's bands. */
  sessions: SessionDefinition[];
}

/* -------------------------------------------------------------------------
 * Shelves
 * ---------------------------------------------------------------------- */

/** The engine's tier label for a Karat, handed in so this file stays type-only. */
export type TierOf = (karat: number) => string;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * One slot per day from `firstDate` to `lastDate`, grouped into months, each
 * month into Monday-first weeks. Every week has seven slots so the weekday
 * columns line up on every shelf; slots before the 1st, after the month's
 * last day, or outside the history are `null`.
 *
 * The assay strips are measured against the month's own largest day, and the
 * month's best and worst days are marked, once each.
 */
export function buildShelves(days: readonly VaultDay[], tierOf?: TierOf): VaultMonth[] {
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
      const summary = monthSummary(monthDays, tierOf);
      const maxAbsMoney = monthDays.reduce(
        (max, day) => (day.kind === 'trading' ? Math.max(max, Math.abs(day.netMoney)) : max),
        0,
      );
      const marked = summary.best !== null && summary.worst !== null && summary.best.date !== summary.worst.date;
      const ordered = monthDays
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => ({
          ...day,
          strip: day.kind === 'trading' ? assayStrip(day.netMoney, maxAbsMoney) : assayStrip(0, maxAbsMoney),
          mark: !marked
            ? null
            : day.date === summary.best?.date
              ? ('best' as const)
              : day.date === summary.worst?.date
                ? ('worst' as const)
                : null,
        }));

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
      return { key, label: monthLabel(key), weeks, summary, maxAbsMoney };
    });
}

/** Counts, sums, the best and worst day, and the mean day Karat — no new metric. */
export function monthSummary(days: readonly VaultDay[], tierOf?: TierOf): MonthSummary {
  const trading = days.filter((day) => day.kind === 'trading');
  let best: DayAmount | null = null;
  let worst: DayAmount | null = null;
  for (const day of trading) {
    if (best === null || day.netMoney > best.netMoney) best = { date: day.date, netMoney: day.netMoney };
    if (worst === null || day.netMoney < worst.netMoney) worst = { date: day.date, netMoney: day.netMoney };
  }
  const karats = trading.flatMap((day) => (day.karat === null ? [] : [day.karat]));
  const averageKarat =
    karats.length === 0
      ? null
      : Math.round((karats.reduce((total, karat) => total + karat, 0) / karats.length) * 10) / 10;
  return {
    tradingDays: trading.length,
    netR: round2(trading.reduce((total, day) => total + day.netR, 0)),
    netMoney: round2(trading.reduce((total, day) => total + day.netMoney, 0)),
    best,
    worst,
    averageKarat,
    averageTier: averageKarat === null || tierOf === undefined ? null : tierKey(tierOf(averageKarat)),
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

/**
 * The Day Assay's own ← and →: the nearest day either side that has one.
 * `dates` is every day with an assay, in order. `null` at either end.
 */
export function stepAssayDay(date: string, direction: -1 | 1, dates: readonly string[]): string | null {
  if (direction === 1) return dates.find((candidate) => candidate > date) ?? null;
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const candidate = dates[index];
    if (candidate !== undefined && candidate < date) return candidate;
  }
  return null;
}

/* -------------------------------------------------------------------------
 * The whole view
 * ---------------------------------------------------------------------- */

export interface VaultSources {
  calendarDays: readonly CalendarDay[];
  /** The Day Assay of every day with manual trades. */
  stories: readonly DayStory[];
  /** First and last day of the history, `YYYY-MM-DD`. */
  firstDate: string;
  lastDate: string;
  currency: string;
  worst: { date: string; start: string } | null;
  tierOf: TierOf;
  sessions?: readonly SessionDefinition[];
}

export function buildVaultView(sources: VaultSources): VaultView {
  const calendar = new Map(sources.calendarDays.map((day) => [day.date, day]));
  const storyByDate = new Map(sources.stories.map((story) => [story.date, story]));

  const days: VaultDay[] = [];
  for (let date = sources.firstDate; dayKeyMs(date) <= dayKeyMs(sources.lastDate); date = addDays(date, 1)) {
    const cal = calendar.get(date);
    const story = storyByDate.get(date);
    const traded = cal !== undefined && cal.tradeCount > 0;
    const karat = cal?.karat ?? null;
    const tierLabel = karat === null ? null : sources.tierOf(karat);
    days.push({
      date,
      day: Number(date.slice(8, 10)),
      column: mondayIndex(date),
      kind: traded ? 'trading' : 'quiet',
      tradeCount: cal?.tradeCount ?? 0,
      manualTradeCount: cal?.manualTradeCount ?? 0,
      netMoney: cal?.netMoney ?? 0,
      netR: cal?.netR ?? 0,
      karat,
      tierLabel,
      tier: tierKey(tierLabel),
      impurityCount: story?.impurityTradeCount ?? 0,
      strip: { direction: 'none', share: 0 },
      mark: null,
    });
  }

  const assays: Record<string, DayAssayView> = {};
  for (const story of sources.stories) {
    const cal = calendar.get(story.date);
    assays[story.date] = buildDayAssayView(story, {
      eaTradeCount: cal === undefined ? 0 : cal.tradeCount - cal.manualTradeCount,
      worst: sources.worst,
    });
  }

  return {
    currency: sources.currency,
    firstDate: sources.firstDate,
    lastDate: sources.lastDate,
    months: buildShelves(days, sources.tierOf),
    assays,
    worst: sources.worst,
    sessions: (sources.sessions ?? []).map((session) => ({ ...session })),
  };
}
