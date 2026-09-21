/**
 * Kavrix demo data generator (CLAUDE.md §11).
 *
 * Produces 90 days of XAUUSD trading for one fictional account: a real price
 * path, a real economic calendar, ~220 manual trades and three Expert
 * Advisors — in exactly the shapes the ingest API sends (CLAUDE.md §12), so
 * `/demo` and a live MT5 account feed the engine the same thing.
 *
 * Two rules govern this file.
 *
 * 1. **Deterministic.** Same seed, byte-identical output. No `Math.random`,
 *    no `Date.now()`; the window ends on a fixed date.
 * 2. **No metrics.** Nothing here computes Karat, R, risk% or Fineness. The
 *    generator shapes *behaviour* — sizes, times, stops, revenge — and the
 *    engine is what later measures it. Targets expressed in R below are
 *    generator inputs used to steer the price path, not engine output.
 *
 * The data is built to tell the stories the product is supposed to discover
 * (CLAUDE.md §11): losses cluster around USD news, revenge trading after
 * losses, the London open is the edge, discipline improves over the last
 * three weeks, EA 1001 and 1002 take the same bet, EA 1003 is drifting.
 * `lib/demo/generate.test.ts` asserts every one of them.
 */

import type {
  Account,
  Deal,
  Ea,
  IngestPayload,
  NewsEvent,
  SlModification,
  SymbolInfo,
  Trade,
  TradeDirection,
} from '@/lib/engine/types';
import { buildDemoCalendar, highImpactEvents } from './calendar';
import {
  DEMO_START_PRICE,
  MINUTE_MS,
  PricePath,
  buildPricePath,
  isMarketOpenAt,
  isRolloverTime,
  roundTo,
} from './price';
import { Rng } from './rng';

/* -------------------------------------------------------------------------
 * Constants — everything a reader needs to reproduce the dataset
 * ---------------------------------------------------------------------- */

/** The one seed the shipped demo uses. Change it and every number changes. */
export const DEMO_SEED = 20_260_920;

/** Length of the demo window, in days. */
export const DEMO_DAYS = 90;

/** Exclusive end of the window: 2026-09-20T00:00Z. Fixed, never `Date.now()`. */
export const DEMO_END_MS = Date.UTC(2026, 8, 20);

/** Inclusive start of the window: 2026-06-22T00:00Z. */
export const DEMO_START_MS = DEMO_END_MS - DEMO_DAYS * 24 * 60 * MINUTE_MS;

/**
 * Length of the closing "improving" phase, in days. The trader's discipline
 * visibly changes at this boundary — that is the arc Wrapped tells.
 */
export const DEMO_IMPROVEMENT_DAYS = 21;

/** First instant of the improving phase. */
export const DEMO_IMPROVEMENT_START_MS =
  DEMO_END_MS - DEMO_IMPROVEMENT_DAYS * 24 * 60 * MINUTE_MS;

/** Window over which EA 1003's drift is visible (CLAUDE.md §7). */
export const DEMO_EA_DRIFT_DAYS = 30;

/** First instant of EA 1003's degraded stretch. */
export const DEMO_EA_DRIFT_START_MS =
  DEMO_END_MS - DEMO_EA_DRIFT_DAYS * 24 * 60 * MINUTE_MS;

export const DEMO_SYMBOL = 'XAUUSD';

/** XAUUSD: 100 oz per 1.00 lot (CLAUDE.md §5). */
export const DEMO_CONTRACT_SIZE = 100;
export const DEMO_DIGITS = 2;

export const DEMO_ACCOUNT_LOGIN = 5_203_847;
export const DEMO_ACCOUNT_SERVER = 'KavrixDemo-Server';
export const DEMO_ACCOUNT_CURRENCY = 'USD';
export const DEMO_ACCOUNT_LEVERAGE = 100;
export const DEMO_STARTING_BALANCE = 25_000;

/** Commission per lot per side, in account currency. $7.00 round turn. */
export const DEMO_COMMISSION_PER_LOT_PER_SIDE = 3.5;

/** Overnight swap per lot, per night. Gold is expensive to hold long. */
export const DEMO_SWAP_LONG_PER_LOT = -11.8;
export const DEMO_SWAP_SHORT_PER_LOT = -3.4;

/** The London-open window the demo edge lives in, in UTC hours. */
export const DEMO_LONDON_OPEN_START_HOUR = 7;
export const DEMO_LONDON_OPEN_END_HOUR = 10;

/**
 * How far from a release a news-window trade is placed, in minutes. Kept
 * inside the ±20 min the story is told with, and outside the release minute
 * itself.
 */
const NEWS_ENTRY_MIN_OFFSET = 3;
const NEWS_ENTRY_MAX_OFFSET = 18;

/** Minutes either side of a release that `normal` trades stay clear of. */
const NEWS_AVOIDANCE_MINUTES = 25;

/**
 * The engine's revenge rule (CLAUDE.md §6.1) fires on *any* trade opened soon
 * after a losing close, or sized up after one — not only on the trades this
 * generator meant as revenge. Ordinary trades are therefore held back from
 * tripping it: their lots stay inside `REVENGE_LOT_GUARD` of the last losing
 * trade's lot, and their entries are nudged past `REVENGE_GAP_GUARD_MINUTES`
 * where the clock allows it. What is left is deliberate.
 */
const REVENGE_LOT_GUARD = 1.24;
const REVENGE_GAP_GUARD_MINUTES = 16;

/** Ceiling on a revenge trade's risk. Reckless, but not account-ending. */
const REVENGE_MAX_RISK_PERCENT = 3;

/** Cohorts whose size is the point, and so is never guarded down. */
const UNGUARDED_COHORTS: readonly ManualCohort[] = ['revenge', 'oversized', 'noStop'];

/** First position id and deal ticket. Chosen to look like a real MT5 account. */
const POSITION_ID_BASE = 700_000;
const DEAL_TICKET_BASE = 900_000;

/** The three demo Expert Advisors (CLAUDE.md §11). */
export const DEMO_EAS: readonly Ea[] = [
  { magic: 1001, name: 'Gold Scalper', baselineExpectancyR: 0.28 },
  { magic: 1002, name: 'London Breakout', baselineExpectancyR: 0.5 },
  { magic: 1003, name: 'Grid Recovery', baselineExpectancyR: 0.3 },
];

/* -------------------------------------------------------------------------
 * The manual trading plan
 * ---------------------------------------------------------------------- */

/**
 * What kind of behaviour a manual trade represents. One cohort per trade —
 * the cohort decides when it is placed, how big it is, and whether it is
 * meant to work out.
 */
export type ManualCohort =
  | 'london'
  | 'news'
  | 'revenge'
  | 'rollover'
  | 'oversized'
  | 'noStop'
  | 'slWidened'
  | 'normal';

/** Cohorts whose entries sit inside a high-impact news window. */
const NEWS_WINDOW_COHORTS: readonly ManualCohort[] = [
  'news',
  'oversized',
  'noStop',
  'slWidened',
];

interface CohortQuota {
  trades: number;
  losses: number;
}

type PhaseQuotas = Record<ManualCohort, CohortQuota>;

/**
 * The plan, written out rather than sampled, because the stories in §11 are
 * requirements and not tendencies. 220 manual trades, 110 of them losers.
 *
 * `early` is the first 69 days; `late` is the closing 21. The difference
 * between the two columns *is* the improvement arc.
 */
const MANUAL_PLAN: { early: PhaseQuotas; late: PhaseQuotas } = {
  early: {
    news: { trades: 37, losses: 31 },
    oversized: { trades: 8, losses: 6 },
    noStop: { trades: 6, losses: 5 },
    slWidened: { trades: 8, losses: 7 },
    revenge: { trades: 19, losses: 16 },
    rollover: { trades: 5, losses: 4 },
    london: { trades: 45, losses: 11 },
    normal: { trades: 35, losses: 11 },
  },
  late: {
    news: { trades: 4, losses: 3 },
    oversized: { trades: 1, losses: 1 },
    noStop: { trades: 0, losses: 0 },
    slWidened: { trades: 1, losses: 1 },
    revenge: { trades: 2, losses: 2 },
    rollover: { trades: 1, losses: 1 },
    london: { trades: 26, losses: 5 },
    normal: { trades: 22, losses: 6 },
  },
};

/* -------------------------------------------------------------------------
 * Blueprints — the intent of a trade, before the price path has its say
 * ---------------------------------------------------------------------- */

type ModificationPlan =
  | { kind: 'widen'; afterMinutes: number; factor: number }
  | { kind: 'breakeven'; afterMinutes: number }
  | { kind: 'lateStop'; afterMinutes: number; distance: number };

interface Blueprint {
  id: number;
  magic: number;
  comment: string;
  cohort: ManualCohort | 'ea';
  /** Planned entry, epoch ms. Revenge trades re-derive this from their parent. */
  plannedEntryMs: number;
  /** Signed R the generator steers the price path towards. */
  targetR: number;
  /** Initial stop distance in USD. `0` means the trade is opened without one. */
  slDistance: number;
  /** Stop distance used to size the position when `slDistance` is 0. */
  sizingDistance: number;
  /** Intended risk as a percentage of equity, or `null` when lots are fixed. */
  riskPercent: number | null;
  /** Fixed lot size (EAs, and revenge trades that copy their parent's lot). */
  fixedVolume: number | null;
  /** Take profit, as a multiple of the stop distance. */
  tpR: number | null;
  maxHoldMinutes: number;
  /** How far the entry may slide when the path cannot deliver the intent. */
  maxEntryShiftMinutes: number;
  modification: ModificationPlan | null;
  /** Revenge trades only: the blueprint whose loss provoked this one. */
  parentId: number | null;
  /** Lot multiple applied to the parent's size (revenge trades only). */
  parentVolumeMultiple: number | null;
  /** Minutes after the parent's close that this trade opens (revenge only). */
  parentDelayMinutes: number | null;
  /** Release this entry is anchored to, for news-window cohorts. */
  newsAnchorMs: number | null;
}

interface RealizedTrade {
  blueprint: Blueprint;
  direction: TradeDirection;
  entryIndex: number;
  exitIndex: number;
  openMs: number;
  closeMs: number;
  openPrice: number;
  closePrice: number;
  volume: number;
  initialSl: number | null;
  initialTp: number | null;
  finalSl: number | null;
  finalTp: number | null;
  grossProfit: number;
  commission: number;
  swap: number;
  netProfit: number;
  mfePrice: number;
  maePrice: number;
  spreadPointsAtEntry: number;
  spreadPointsAtExit: number;
  equityAtEntry: number;
  /** The SL/TP change that actually happened, if any. */
  modification: { timeMs: number; sl: number; tp: number } | null;
}

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */

function toIso(timeMs: number): string {
  return new Date(timeMs).toISOString();
}

function utcDateKey(timeMs: number): string {
  return new Date(timeMs).toISOString().slice(0, 10);
}

function startOfUtcDay(timeMs: number): number {
  return Math.floor(timeMs / 86_400_000) * 86_400_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`index ${index} out of range (length ${items.length})`);
  }
  return item;
}

/** Lots are quoted to two decimals, with a 0.01 minimum. */
function roundVolume(volume: number): number {
  return clamp(roundTo(volume, 2), 0.01, 50);
}

/**
 * Nights the position was held, for swap. The Wednesday-to-Thursday rollover
 * is charged triple, the way brokers charge for the weekend value date.
 */
function swapNights(openMs: number, closeMs: number): number {
  const firstMidnight = startOfUtcDay(openMs) + 86_400_000;
  let nights = 0;
  for (let midnight = firstMidnight; midnight <= closeMs; midnight += 86_400_000) {
    nights += new Date(midnight).getUTCDay() === 4 ? 3 : 1;
  }
  return nights;
}

/**
 * Draws `total` outcomes of which exactly `losses` are losses, one at a time.
 * Sequential sampling: the counts always land exactly, the order does not.
 */
function makeOutcomes(rng: Rng, total: number, losses: number): boolean[] {
  const outcomes: boolean[] = [];
  let lossesLeft = losses;
  let left = total;
  for (let i = 0; i < total; i += 1) {
    const wantLoss = lossesLeft > 0 && rng.next() < lossesLeft / left;
    outcomes.push(wantLoss);
    if (wantLoss) lossesLeft -= 1;
    left -= 1;
  }
  return outcomes;
}

/* -------------------------------------------------------------------------
 * Trading days and news days
 * ---------------------------------------------------------------------- */

interface TradingDay {
  /** UTC midnight of the day. */
  dayMs: number;
  dateKey: string;
  /** High-impact release times on this day, epoch ms, ascending. */
  eventTimes: number[];
  late: boolean;
}

function buildTradingDays(calendar: readonly NewsEvent[]): TradingDay[] {
  const eventsByDate = new Map<string, number[]>();
  for (const event of highImpactEvents(calendar)) {
    const timeMs = Date.parse(event.time);
    const key = utcDateKey(timeMs);
    const bucket = eventsByDate.get(key);
    if (bucket === undefined) eventsByDate.set(key, [timeMs]);
    else bucket.push(timeMs);
  }

  const days: TradingDay[] = [];
  for (let dayMs = DEMO_START_MS; dayMs < DEMO_END_MS; dayMs += 86_400_000) {
    // Midday is the honest test of "is this a trading day": Gold is open on
    // Sunday night, but nobody in this demo trades it.
    if (!isMarketOpenAt(dayMs + 12 * 60 * MINUTE_MS)) continue;
    const dateKey = utcDateKey(dayMs);
    days.push({
      dayMs,
      dateKey,
      eventTimes: (eventsByDate.get(dateKey) ?? []).slice().sort((a, b) => a - b),
      late: dayMs >= DEMO_IMPROVEMENT_START_MS,
    });
  }
  return days;
}

/* -------------------------------------------------------------------------
 * Manual blueprints
 * ---------------------------------------------------------------------- */

interface Slot {
  cohort: ManualCohort;
  wantLoss: boolean;
  /** Release this slot is anchored to, for news-window cohorts. */
  eventMs: number | null;
  /** Entered before the release — the trade a revenge trade answers. */
  preRelease: boolean;
  /** Provisional entry, used to order realization. */
  plannedEntryMs: number;
  /** Index of the parent slot within the same day (revenge only). */
  parentIndex: number | null;
}

/** Risk as a percentage of equity, per cohort. The violations are deliberate. */
function riskPercentFor(rng: Rng, cohort: ManualCohort, late: boolean): number {
  const base = ((): number => {
    switch (cohort) {
      case 'oversized':
        return rng.float(1.9, 2.8);
      case 'noStop':
        return rng.float(1.0, 1.3);
      case 'news':
        return rng.float(0.85, 1.05);
      case 'slWidened':
        return rng.float(0.8, 1.0);
      case 'rollover':
        return rng.float(0.75, 0.95);
      default:
        return rng.float(0.7, 0.9);
    }
  })();
  // In the closing phase the trader has their size under control.
  return late && cohort !== 'oversized' ? Math.min(base * 0.85, 0.9) : base;
}

function stopDistanceFor(rng: Rng, cohort: ManualCohort): number {
  switch (cohort) {
    case 'oversized':
      return rng.float(2.6, 3.4);
    case 'rollover':
      return rng.float(3.2, 4.4);
    case 'slWidened':
      return rng.float(2.6, 3.4);
    case 'news':
      return rng.float(2.8, 3.8);
    case 'revenge':
      return rng.float(2.6, 3.6);
    default:
      return rng.float(3.0, 4.4);
  }
}

function maxHoldFor(rng: Rng, cohort: ManualCohort): number {
  switch (cohort) {
    case 'london':
      return rng.int(45, 240);
    case 'news':
      return rng.int(20, 90);
    case 'revenge':
      return rng.int(15, 70);
    case 'oversized':
      return rng.int(20, 90);
    case 'noStop':
      return rng.int(90, 320);
    case 'slWidened':
      return rng.int(40, 180);
    case 'rollover':
      return rng.int(30, 120);
    default:
      return rng.int(30, 180);
  }
}

/** The R the generator aims the path at. Losses are where the story lives. */
function targetRFor(rng: Rng, cohort: ManualCohort, wantLoss: boolean): number {
  if (!wantLoss) {
    switch (cohort) {
      case 'london':
        return rng.float(1.1, 3.0);
      case 'normal':
        return rng.float(0.8, 2.2);
      case 'news':
        return rng.float(0.6, 1.6);
      default:
        return rng.float(0.5, 1.5);
    }
  }
  switch (cohort) {
    case 'noStop':
      return -rng.float(1.8, 3.2);
    case 'slWidened':
      return -rng.float(1.8, 2.6);
    case 'revenge':
      return -rng.float(1.2, 2.4);
    default:
      // Most stopped-out trades lose their stop; some are cut early.
      return rng.bool(0.3) ? -rng.float(0.35, 0.8) : -1;
  }
}

/** Picks an entry minute for a `normal` trade: away from news, rollover and London. */
function pickNormalEntry(rng: Rng, day: TradingDay): number {
  const windows: ReadonlyArray<readonly [number, number]> = [
    [10 * 60 + 15, 12 * 60],
    [15 * 60, 17 * 60 + 30],
    [19 * 60, 20 * 60 + 45],
  ];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [from, to] = rng.pick(windows);
    const minuteOfDay = rng.int(from, to);
    const timeMs = day.dayMs + minuteOfDay * MINUTE_MS;
    if (!isMarketOpenAt(timeMs)) continue;
    if (isRolloverTime(timeMs)) continue;
    const nearNews = day.eventTimes.some(
      (eventMs) => Math.abs(timeMs - eventMs) <= NEWS_AVOIDANCE_MINUTES * MINUTE_MS,
    );
    if (!nearNews) return timeMs;
  }
  return day.dayMs + (20 * 60 + 30) * MINUTE_MS;
}

/** Picks an entry inside the rollover window, on a day the market is open for it. */
function pickRolloverEntry(rng: Rng, day: TradingDay): number {
  const morning = day.dayMs + rng.int(2, 14) * MINUTE_MS;
  if (isMarketOpenAt(morning)) return morning;
  const evening = day.dayMs + (23 * 60 + rng.int(46, 58)) * MINUTE_MS;
  return evening;
}

/**
 * Turns the plan into per-day slots.
 *
 * News-window cohorts are spread round-robin over the days that actually have
 * a high-impact release; everything else is spread over every trading day.
 * Each revenge slot is attached to a losing trade entered *before* a release,
 * so the revenge entry lands back inside the same news window — which is what
 * makes both stories true at once.
 */
function buildSlots(rng: Rng, days: readonly TradingDay[], quotas: PhaseQuotas): Map<number, Slot[]> {
  const byDay = new Map<number, Slot[]>();
  for (const day of days) byDay.set(day.dayMs, []);

  const eventDays = days.filter((day) => day.eventTimes.length > 0);
  const otherCohorts: ManualCohort[] = ['london', 'normal', 'rollover'];

  // --- news-window cohorts -------------------------------------------------
  const newsSlotSpecs: Array<{ cohort: ManualCohort; wantLoss: boolean }> = [];
  for (const cohort of NEWS_WINDOW_COHORTS) {
    const quota = quotas[cohort];
    const outcomes = makeOutcomes(rng, quota.trades, quota.losses);
    for (const wantLoss of outcomes) newsSlotSpecs.push({ cohort, wantLoss });
  }
  const shuffledNews = rng.shuffle(newsSlotSpecs);

  if (eventDays.length > 0) {
    shuffledNews.forEach((spec, index) => {
      const day = at(eventDays, index % eventDays.length);
      const slots = byDay.get(day.dayMs);
      if (slots === undefined) return;
      const eventMs = at(day.eventTimes, index % day.eventTimes.length);
      const offset = rng.int(NEWS_ENTRY_MIN_OFFSET, NEWS_ENTRY_MAX_OFFSET);
      const before = rng.bool(0.5);
      slots.push({
        cohort: spec.cohort,
        wantLoss: spec.wantLoss,
        eventMs,
        preRelease: false,
        plannedEntryMs: eventMs + (before ? -offset : offset) * MINUTE_MS,
        parentIndex: null,
      });
    });
  }

  // --- revenge slots -------------------------------------------------------
  const revengeOutcomes = makeOutcomes(rng, quotas.revenge.trades, quotas.revenge.losses);
  const usedParents = new Set<string>();
  let revengePlaced = 0;
  for (let pass = 0; pass < 4 && revengePlaced < revengeOutcomes.length; pass += 1) {
    for (const day of eventDays) {
      if (revengePlaced >= revengeOutcomes.length) break;
      const slots = byDay.get(day.dayMs);
      if (slots === undefined) continue;
      const parentIndex = slots.findIndex(
        (slot, index) =>
          slot.wantLoss &&
          slot.eventMs !== null &&
          slot.cohort !== 'revenge' &&
          !usedParents.has(`${day.dayMs}:${index}`),
      );
      if (parentIndex === -1) continue;
      usedParents.add(`${day.dayMs}:${parentIndex}`);
      const parent = at(slots, parentIndex);
      const parentEvent = parent.eventMs;
      if (parentEvent === null) continue;

      // The parent is re-cast as a pre-release entry that gets run over by the
      // release itself; the revenge follows a few minutes after it is stopped.
      parent.preRelease = true;
      parent.plannedEntryMs = parentEvent - rng.int(10, 18) * MINUTE_MS;

      slots.push({
        cohort: 'revenge',
        wantLoss: at(revengeOutcomes, revengePlaced),
        eventMs: parentEvent,
        preRelease: false,
        plannedEntryMs: parent.plannedEntryMs + 20 * MINUTE_MS,
        parentIndex,
      });
      revengePlaced += 1;
    }
  }

  // --- everything else -----------------------------------------------------
  const plainSpecs: Array<{ cohort: ManualCohort; wantLoss: boolean }> = [];
  for (const cohort of otherCohorts) {
    const quota = quotas[cohort];
    const outcomes = makeOutcomes(rng, quota.trades, quota.losses);
    for (const wantLoss of outcomes) plainSpecs.push({ cohort, wantLoss });
  }
  const shuffledPlain = rng.shuffle(plainSpecs);
  const dayOrder = rng.shuffle(days);

  shuffledPlain.forEach((spec, index) => {
    const day = at(dayOrder, index % dayOrder.length);
    const slots = byDay.get(day.dayMs);
    if (slots === undefined) return;
    let plannedEntryMs: number;
    if (spec.cohort === 'london') {
      plannedEntryMs =
        day.dayMs +
        (DEMO_LONDON_OPEN_START_HOUR * 60 +
          rng.int(0, (DEMO_LONDON_OPEN_END_HOUR - DEMO_LONDON_OPEN_START_HOUR) * 60 - 1)) *
          MINUTE_MS;
    } else if (spec.cohort === 'rollover') {
      plannedEntryMs = pickRolloverEntry(rng, day);
    } else {
      plannedEntryMs = pickNormalEntry(rng, day);
    }
    slots.push({
      cohort: spec.cohort,
      wantLoss: spec.wantLoss,
      eventMs: null,
      preRelease: false,
      plannedEntryMs,
      parentIndex: null,
    });
  });

  return byDay;
}

/** Turns one day's slots into blueprints, resolving parent links to ids. */
function slotsToBlueprints(
  rng: Rng,
  day: TradingDay,
  slots: readonly Slot[],
  nextId: () => number,
): Blueprint[] {
  const blueprints: Blueprint[] = [];
  const idBySlotIndex = new Map<number, number>();

  // Parents before their revenge trades: a revenge slot is provisionally
  // placed after its parent's entry, so ordering by time is enough.
  const order = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => a.slot.plannedEntryMs - b.slot.plannedEntryMs || a.index - b.index);

  for (const { slot, index } of order) {
    const id = nextId();
    idBySlotIndex.set(index, id);
    const cohort = slot.cohort;
    const slDistance = cohort === 'noStop' ? 0 : stopDistanceFor(rng, cohort);
    const sizingDistance = cohort === 'noStop' ? rng.float(3.5, 5.0) : slDistance;
    const targetR = targetRFor(rng, cohort, slot.wantLoss);

    let maxHold = maxHoldFor(rng, cohort);
    if (slot.preRelease && slot.eventMs !== null) {
      // Hold only until just past the release: the point is to be stopped by it.
      maxHold = Math.round((slot.eventMs - slot.plannedEntryMs) / MINUTE_MS) + 8;
    }

    let modification: ModificationPlan | null = null;
    if (cohort === 'slWidened') {
      modification = { kind: 'widen', afterMinutes: rng.int(3, 7), factor: rng.float(2.0, 2.9) };
    } else if (cohort === 'noStop' && rng.bool(0.4)) {
      modification = {
        kind: 'lateStop',
        afterMinutes: rng.int(25, 70),
        distance: sizingDistance * rng.float(1.6, 2.4),
      };
    } else if (!slot.wantLoss && (cohort === 'london' || cohort === 'normal') && rng.bool(0.18)) {
      modification = { kind: 'breakeven', afterMinutes: rng.int(15, 45) };
    }

    const parentId =
      slot.parentIndex === null ? null : (idBySlotIndex.get(slot.parentIndex) ?? null);

    blueprints.push({
      id,
      magic: 0,
      comment: '',
      cohort,
      plannedEntryMs: slot.plannedEntryMs,
      targetR,
      slDistance: roundTo(slDistance, 2),
      sizingDistance: roundTo(sizingDistance, 2),
      riskPercent: cohort === 'revenge' ? null : riskPercentFor(rng, cohort, day.late),
      fixedVolume: null,
      tpR: slot.wantLoss ? null : roundTo(Math.abs(targetR) + rng.float(0.1, 0.6), 2),
      maxHoldMinutes: maxHold,
      maxEntryShiftMinutes: slot.eventMs === null ? 45 : 4,
      modification,
      parentId,
      parentVolumeMultiple: cohort === 'revenge' ? rng.float(1.5, 2.4) : null,
      parentDelayMinutes: cohort === 'revenge' ? rng.int(3, 11) : null,
      newsAnchorMs: slot.eventMs,
    });
  }

  return blueprints;
}

/* -------------------------------------------------------------------------
 * EA blueprints
 * ---------------------------------------------------------------------- */

/**
 * EA trades.
 *
 * Gold Scalper (1001) and London Breakout (1002) read the same daily bias —
 * a per-day factor both of them are driven by — which is exactly what makes
 * their daily P&L correlate, and what Constellation is supposed to surface as
 * "same bet". Grid Recovery (1003) trades a different rhythm and degrades
 * over the closing 30 days.
 */
function buildEaBlueprints(
  rng: Rng,
  days: readonly TradingDay[],
  nextId: () => number,
): Blueprint[] {
  const blueprints: Blueprint[] = [];

  for (const day of days) {
    const dayFactor = rng.normal();

    // --- 1001 Gold Scalper ---------------------------------------------
    const scalps = rng.int(3, 6);
    for (let i = 0; i < scalps; i += 1) {
      const minuteOfDay = rng.int(7 * 60, 19 * 60);
      const targetR = clamp(0.16 + 0.85 * dayFactor + rng.gaussian(0, 0.45), -2.2, 2.6);
      blueprints.push({
        id: nextId(),
        magic: 1001,
        comment: 'Gold Scalper',
        cohort: 'ea',
        plannedEntryMs: day.dayMs + minuteOfDay * MINUTE_MS,
        targetR,
        slDistance: roundTo(rng.float(1.8, 2.6), 2),
        sizingDistance: 0,
        riskPercent: null,
        fixedVolume: 0.1,
        tpR: null,
        maxHoldMinutes: rng.int(25, 70),
        maxEntryShiftMinutes: 30,
        modification: null,
        parentId: null,
        parentVolumeMultiple: null,
        parentDelayMinutes: null,
        newsAnchorMs: null,
      });
    }

    // --- 1002 London Breakout -------------------------------------------
    const breakouts = rng.int(1, 3);
    for (let i = 0; i < breakouts; i += 1) {
      const minuteOfDay = rng.int(7 * 60 + 5, 9 * 60 + 30);
      const targetR = clamp(0.3 + 1.05 * dayFactor + rng.gaussian(0, 0.4), -2, 3.2);
      blueprints.push({
        id: nextId(),
        magic: 1002,
        comment: 'London Breakout',
        cohort: 'ea',
        plannedEntryMs: day.dayMs + minuteOfDay * MINUTE_MS,
        targetR,
        slDistance: roundTo(rng.float(3.4, 5.0), 2),
        sizingDistance: 0,
        riskPercent: null,
        fixedVolume: 0.2,
        tpR: null,
        maxHoldMinutes: rng.int(60, 240),
        maxEntryShiftMinutes: 45,
        modification: null,
        parentId: null,
        parentVolumeMultiple: null,
        parentDelayMinutes: null,
        newsAnchorMs: null,
      });
    }

    // --- 1003 Grid Recovery ---------------------------------------------
    const drifting = day.dayMs >= DEMO_EA_DRIFT_START_MS;
    const grids = rng.int(2, 4);
    for (let i = 0; i < grids; i += 1) {
      const minuteOfDay = rng.int(1 * 60, 21 * 60);
      const lossChance = drifting ? 0.38 : 0.12;
      const wantLoss = rng.bool(lossChance);
      const targetR = wantLoss
        ? -(drifting ? rng.float(1.6, 2.8) : rng.float(1.2, 1.8))
        : drifting
          ? rng.float(0.3, 0.5)
          : rng.float(0.45, 0.65);
      blueprints.push({
        id: nextId(),
        magic: 1003,
        comment: 'Grid Recovery',
        cohort: 'ea',
        plannedEntryMs: day.dayMs + minuteOfDay * MINUTE_MS,
        targetR,
        slDistance: roundTo(rng.float(5.0, 8.0), 2),
        sizingDistance: 0,
        riskPercent: null,
        fixedVolume: at([0.05, 0.1, 0.15, 0.2], rng.int(0, 3)),
        tpR: null,
        maxHoldMinutes: rng.int(90, 480),
        maxEntryShiftMinutes: 60,
        modification: null,
        parentId: null,
        parentVolumeMultiple: null,
        parentDelayMinutes: null,
        newsAnchorMs: null,
      });
    }
  }

  return blueprints;
}

/* -------------------------------------------------------------------------
 * Realization — walking a blueprint forward along the price path
 * ---------------------------------------------------------------------- */

type ExitReason = 'sl' | 'tp' | 'target' | 'time' | 'extreme';

interface Simulation {
  direction: TradeDirection;
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  reason: ExitReason;
  mfePrice: number;
  maePrice: number;
  finalSl: number;
  finalTp: number;
  modification: { timeMs: number; sl: number; tp: number } | null;
  grossProfit: number;
  netProfit: number;
  commission: number;
  swap: number;
  achievedR: number;
}

interface SimulationInput {
  path: PricePath;
  entryIndex: number;
  direction: TradeDirection;
  volume: number;
  slDistance: number;
  sizingDistance: number;
  targetR: number;
  tpR: number | null;
  maxHoldMinutes: number;
  modification: ModificationPlan | null;
}

/**
 * Walks the path from the entry bar until something closes the position: the
 * stop, the take profit, the R the generator is aiming at, or time. Every
 * price it returns is a price the path actually printed.
 *
 * The path holds mid prices; a buy pays the ask (mid + half the spread) and
 * is closed on the bid, and the other way round for a sell.
 */
function simulate(input: SimulationInput): Simulation {
  const {
    path,
    entryIndex,
    direction,
    volume,
    slDistance,
    sizingDistance,
    targetR,
    tpR,
    maxHoldMinutes,
    modification,
  } = input;

  const sign = direction === 'buy' ? 1 : -1;
  const entryHalf = path.halfSpread(entryIndex);
  const entryPrice = roundTo(path.close(entryIndex) + sign * entryHalf, DEMO_DIGITS);
  const riskDistance = slDistance > 0 ? slDistance : sizingDistance;

  let stopPrice = slDistance > 0 ? roundTo(entryPrice - sign * slDistance, DEMO_DIGITS) : 0;
  const takeProfit =
    tpR !== null && riskDistance > 0
      ? roundTo(entryPrice + sign * tpR * riskDistance, DEMO_DIGITS)
      : 0;
  const targetPrice = roundTo(entryPrice + sign * targetR * riskDistance, DEMO_DIGITS);

  let mfePrice = path.close(entryIndex);
  let maePrice = path.close(entryIndex);
  let appliedModification: { timeMs: number; sl: number; tp: number } | null = null;

  let exitIndex = entryIndex;
  let exitPrice = entryPrice;
  let reason: ExitReason = 'time';

  const lastIndex = Math.min(entryIndex + maxHoldMinutes, path.length - 1);

  for (let index = entryIndex + 1; index <= lastIndex; index += 1) {
    if (!path.isOpen(index)) {
      exitIndex = index - 1;
      exitPrice = roundTo(path.close(exitIndex) - sign * path.halfSpread(exitIndex), DEMO_DIGITS);
      reason = 'time';
      break;
    }

    const half = path.halfSpread(index);
    const high = path.high(index);
    const low = path.low(index);
    mfePrice = sign > 0 ? Math.max(mfePrice, high) : Math.min(mfePrice, low);
    maePrice = sign > 0 ? Math.min(maePrice, low) : Math.max(maePrice, high);

    if (modification !== null && appliedModification === null && index - entryIndex >= modification.afterMinutes) {
      if (modification.kind === 'widen' && stopPrice !== 0) {
        stopPrice = roundTo(entryPrice - sign * slDistance * modification.factor, DEMO_DIGITS);
      } else if (modification.kind === 'breakeven' && stopPrice !== 0) {
        stopPrice = entryPrice;
      } else if (modification.kind === 'lateStop') {
        stopPrice = roundTo(entryPrice - sign * modification.distance, DEMO_DIGITS);
      }
      appliedModification = { timeMs: path.timeAt(index), sl: stopPrice, tp: takeProfit };
    }

    // Exit prices are on the far side of the spread from the entry.
    const adverseFill = sign > 0 ? low - half : high + half;
    const favorableFill = sign > 0 ? high - half : low + half;

    const adverseLevels: Array<{ price: number; reason: ExitReason }> = [];
    if (stopPrice !== 0) adverseLevels.push({ price: stopPrice, reason: 'sl' });
    if (targetR < 0) adverseLevels.push({ price: targetPrice, reason: 'target' });
    adverseLevels.sort(
      (a, b) => Math.abs(a.price - entryPrice) - Math.abs(b.price - entryPrice),
    );

    let closed = false;
    for (const level of adverseLevels) {
      const touched = sign > 0 ? adverseFill <= level.price : adverseFill >= level.price;
      if (touched) {
        exitIndex = index;
        exitPrice = level.price;
        reason = level.reason;
        closed = true;
        break;
      }
    }
    if (closed) break;

    const favorableLevels: Array<{ price: number; reason: ExitReason }> = [];
    if (takeProfit !== 0) favorableLevels.push({ price: takeProfit, reason: 'tp' });
    if (targetR > 0) favorableLevels.push({ price: targetPrice, reason: 'target' });
    favorableLevels.sort(
      (a, b) => Math.abs(a.price - entryPrice) - Math.abs(b.price - entryPrice),
    );

    for (const level of favorableLevels) {
      const touched = sign > 0 ? favorableFill >= level.price : favorableFill <= level.price;
      if (touched) {
        exitIndex = index;
        exitPrice = level.price;
        reason = level.reason;
        closed = true;
        break;
      }
    }
    if (closed) break;

    if (index === lastIndex) {
      exitIndex = index;
      exitPrice = roundTo(path.close(index) - sign * half, DEMO_DIGITS);
      reason = 'time';
    }
  }

  if (exitIndex === entryIndex) {
    exitIndex = Math.min(entryIndex + 1, path.length - 1);
    exitPrice = roundTo(
      path.close(exitIndex) - sign * path.halfSpread(exitIndex),
      DEMO_DIGITS,
    );
  }

  if (appliedModification !== null && appliedModification.timeMs > path.timeAt(exitIndex)) {
    appliedModification = null;
  }

  return finish({
    path,
    direction,
    entryIndex,
    exitIndex,
    entryPrice,
    exitPrice,
    reason,
    mfePrice,
    maePrice,
    volume,
    riskDistance,
    finalSl: appliedModification === null ? (slDistance > 0 ? roundTo(entryPrice - sign * slDistance, DEMO_DIGITS) : 0) : appliedModification.sl,
    finalTp: takeProfit,
    modification: appliedModification,
  });
}

interface FinishInput {
  path: PricePath;
  direction: TradeDirection;
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  reason: ExitReason;
  mfePrice: number;
  maePrice: number;
  volume: number;
  riskDistance: number;
  finalSl: number;
  finalTp: number;
  modification: { timeMs: number; sl: number; tp: number } | null;
}

/** Turns an entry/exit pair into money: gross, commission, swap, net. */
function finish(input: FinishInput): Simulation {
  const sign = input.direction === 'buy' ? 1 : -1;
  const openMs = input.path.timeAt(input.entryIndex);
  const closeMs = input.path.timeAt(input.exitIndex);

  const grossProfit = roundTo(
    sign * (input.exitPrice - input.entryPrice) * input.volume * DEMO_CONTRACT_SIZE,
    2,
  );
  const commission = roundTo(-2 * DEMO_COMMISSION_PER_LOT_PER_SIDE * input.volume, 2);
  const perNight = sign > 0 ? DEMO_SWAP_LONG_PER_LOT : DEMO_SWAP_SHORT_PER_LOT;
  const swap = roundTo(perNight * input.volume * swapNights(openMs, closeMs), 2);
  const netProfit = roundTo(grossProfit + commission + swap, 2);
  const riskMoney = input.riskDistance * input.volume * DEMO_CONTRACT_SIZE;

  return {
    direction: input.direction,
    entryIndex: input.entryIndex,
    exitIndex: input.exitIndex,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    reason: input.reason,
    mfePrice: roundTo(input.mfePrice, DEMO_DIGITS),
    maePrice: roundTo(input.maePrice, DEMO_DIGITS),
    finalSl: input.finalSl,
    finalTp: input.finalTp,
    modification: input.modification,
    grossProfit,
    commission,
    swap,
    netProfit,
    achievedR: riskMoney > 0 ? netProfit / riskMoney : 0,
  };
}

/** Re-runs a simulation, forcing the exit to the best (or worst) price reached. */
function simulateExtreme(input: SimulationInput, wantLoss: boolean): Simulation {
  const { path, entryIndex, direction, volume, slDistance, sizingDistance, maxHoldMinutes } = input;
  const sign = direction === 'buy' ? 1 : -1;
  const entryPrice = roundTo(
    path.close(entryIndex) + sign * path.halfSpread(entryIndex),
    DEMO_DIGITS,
  );
  const lastIndex = Math.min(entryIndex + maxHoldMinutes, path.length - 1);

  let bestIndex = Math.min(entryIndex + 1, path.length - 1);
  let bestFill = entryPrice;
  let runningMfe = path.close(entryIndex);
  let runningMae = path.close(entryIndex);
  // Excursions are only meaningful while the position is open, so they are
  // snapshotted at the bar that ends up being the exit — not at the end of
  // the horizon this scan walks.
  let mfePrice = runningMfe;
  let maePrice = runningMae;
  let found = false;

  for (let index = entryIndex + 1; index <= lastIndex; index += 1) {
    if (!path.isOpen(index)) break;
    const half = path.halfSpread(index);
    const high = path.high(index);
    const low = path.low(index);
    runningMfe = sign > 0 ? Math.max(runningMfe, high) : Math.min(runningMfe, low);
    runningMae = sign > 0 ? Math.min(runningMae, low) : Math.max(runningMae, high);

    const fill = wantLoss
      ? sign > 0
        ? low - half
        : high + half
      : sign > 0
        ? high - half
        : low + half;
    const better = wantLoss
      ? sign > 0
        ? fill < bestFill
        : fill > bestFill
      : sign > 0
        ? fill > bestFill
        : fill < bestFill;
    if (!found || better) {
      found = true;
      bestFill = fill;
      bestIndex = index;
      mfePrice = runningMfe;
      maePrice = runningMae;
    }
  }

  return finish({
    path,
    direction,
    entryIndex,
    exitIndex: bestIndex,
    entryPrice,
    exitPrice: roundTo(bestFill, DEMO_DIGITS),
    reason: 'extreme',
    mfePrice,
    maePrice,
    volume,
    riskDistance: slDistance > 0 ? slDistance : sizingDistance,
    finalSl: slDistance > 0 ? roundTo(entryPrice - sign * slDistance, DEMO_DIGITS) : 0,
    finalTp: 0,
    modification: null,
  });
}

const DIRECTIONS: readonly TradeDirection[] = ['buy', 'sell'];

/**
 * Chooses the direction, and if necessary nudges the entry forward, until the
 * path delivers the behaviour the blueprint asked for. Both directions are
 * tried; the winner is the one whose outcome lands closest to the intent.
 */
function realize(
  path: PricePath,
  blueprint: Blueprint,
  entryIndex: number,
  volume: number,
): Simulation {
  const wantLoss = blueprint.targetR < 0;
  let best: Simulation | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const shiftStep = 3;
  const maxShift = blueprint.maxEntryShiftMinutes;

  for (let shift = 0; shift <= maxShift; shift += shiftStep) {
    const index = entryIndex + shift;
    if (index >= path.length - 2 || !path.isOpen(index)) break;

    for (const direction of DIRECTIONS) {
      const input: SimulationInput = {
        path,
        entryIndex: index,
        direction,
        volume,
        slDistance: blueprint.slDistance,
        sizingDistance: blueprint.sizingDistance,
        targetR: blueprint.targetR,
        tpR: blueprint.tpR,
        maxHoldMinutes: blueprint.maxHoldMinutes,
        modification: blueprint.modification,
      };
      const candidates = [simulate(input), simulateExtreme(input, wantLoss)];
      for (const candidate of candidates) {
        const correctSign = wantLoss ? candidate.netProfit < 0 : candidate.netProfit > 0;
        const score =
          Math.abs(candidate.achievedR - blueprint.targetR) + (correctSign ? 0 : 1000) + shift / 600;
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
    if (bestScore < 0.4) break;
  }

  if (best === null) {
    throw new Error(`demo generator could not realize blueprint ${blueprint.id}`);
  }
  return best;
}

/* -------------------------------------------------------------------------
 * Assembly
 * ---------------------------------------------------------------------- */

/** What `generateDemoData` returns: an ingest payload plus its derived trades. */
export interface DemoDataset extends IngestPayload {
  trades: Trade[];
  eas: Ea[];
  meta: DemoMeta;
}

export interface DemoMeta {
  /** Always "Demo data" — the banner copy, and a promise about honesty (§2). */
  label: 'Demo data';
  seed: number;
  days: number;
  symbol: string;
  startTime: string;
  endTime: string;
  /** Where the trader's behaviour visibly improves. */
  improvementPhaseStart: string;
  /** Where EA 1003 starts drifting. */
  eaDriftStart: string;
  startingBalance: number;
  startingPrice: number;
}

/**
 * The demo price path on its own.
 *
 * The path is the first thing the generator draws from the seed, so rebuilding
 * it from the same seed gives exactly the bars the demo trades were priced
 * against — which is what lets a test check that no trade quotes a price the
 * market never printed.
 */
export function buildDemoPricePath(seed: number = DEMO_SEED): PricePath {
  return buildPath(new Rng(seed));
}

function buildPath(rng: Rng): PricePath {
  const eventTimes = highImpactEvents(buildDemoCalendar()).map((event) =>
    Date.parse(event.time),
  );
  return buildPricePath(rng, eventTimes, DEMO_START_MS, DEMO_DAYS * 24 * 60);
}

export interface GenerateDemoOptions {
  /** Defaults to `DEMO_SEED`. Any other seed produces a different account. */
  seed?: number;
}

/**
 * Builds the whole demo account.
 *
 * Pure: the only input is the seed, and the same seed always produces the
 * same bytes.
 */
export function generateDemoData(options: GenerateDemoOptions = {}): DemoDataset {
  const seed = options.seed ?? DEMO_SEED;
  const rng = new Rng(seed);

  const calendar = buildDemoCalendar();
  const path = buildPath(rng);

  const days = buildTradingDays(calendar);
  const earlyDays = days.filter((day) => !day.late);
  const lateDays = days.filter((day) => day.late);

  let idCounter = 0;
  const nextId = (): number => {
    idCounter += 1;
    return idCounter;
  };

  const blueprints: Blueprint[] = [];
  for (const [phaseDays, quotas] of [
    [earlyDays, MANUAL_PLAN.early] as const,
    [lateDays, MANUAL_PLAN.late] as const,
  ]) {
    const slotsByDay = buildSlots(rng, phaseDays, quotas);
    for (const day of phaseDays) {
      const slots = slotsByDay.get(day.dayMs);
      if (slots === undefined || slots.length === 0) continue;
      blueprints.push(...slotsToBlueprints(rng, day, slots, nextId));
    }
  }
  blueprints.push(...buildEaBlueprints(rng, days, nextId));

  // Realize in chronological order so equity — and every revenge trade's
  // parent — is already known by the time a trade is priced.
  const ordered = blueprints
    .slice()
    .sort((a, b) => a.plannedEntryMs - b.plannedEntryMs || a.id - b.id);

  const realizedById = new Map<number, RealizedTrade>();
  const closed: Array<{ closeMs: number; netProfit: number }> = [];
  const closedManual: Array<{ closeMs: number; netProfit: number; volume: number }> = [];

  /** The last manual trade to close before `timeMs` — what §6.1 calls "the previous trade". */
  const previousManualClose = (
    timeMs: number,
  ): { closeMs: number; netProfit: number; volume: number } | null => {
    let latest: { closeMs: number; netProfit: number; volume: number } | null = null;
    for (const item of closedManual) {
      if (item.closeMs >= timeMs) continue;
      if (latest === null || item.closeMs > latest.closeMs) latest = item;
    }
    return latest;
  };

  const equityAt = (timeMs: number): number => {
    let equity = DEMO_STARTING_BALANCE;
    for (const item of closed) {
      if (item.closeMs <= timeMs) equity += item.netProfit;
    }
    return roundTo(equity, 2);
  };

  const realizedTrades: RealizedTrade[] = [];

  for (const blueprint of ordered) {
    let entryMs = blueprint.plannedEntryMs;
    let fixedVolume = blueprint.fixedVolume;

    if (blueprint.parentId !== null) {
      const parent = realizedById.get(blueprint.parentId);
      if (parent === undefined) continue; // parent could not be realized
      const delay = blueprint.parentDelayMinutes ?? 5;
      entryMs = parent.closeMs + delay * MINUTE_MS;
      fixedVolume = roundVolume(parent.volume * (blueprint.parentVolumeMultiple ?? 1.6));
    }

    const isManual = blueprint.magic === 0;
    const cohort = blueprint.cohort;
    const guarded =
      isManual && cohort !== 'ea' && !UNGUARDED_COHORTS.includes(cohort);

    // Keep an ordinary trade from accidentally reading as revenge: give it
    // more than fifteen minutes of distance from the last losing close, as
    // long as that does not drag a news-window entry out of its window.
    if (guarded) {
      for (let pass = 0; pass < 3; pass += 1) {
        const previous = previousManualClose(entryMs);
        if (previous === null || previous.netProfit >= 0) break;
        if ((entryMs - previous.closeMs) / MINUTE_MS > 15) break;
        const shifted = previous.closeMs + REVENGE_GAP_GUARD_MINUTES * MINUTE_MS;
        if (
          blueprint.newsAnchorMs !== null &&
          Math.abs(shifted - blueprint.newsAnchorMs) > 19 * MINUTE_MS
        ) {
          break;
        }
        entryMs = shifted;
      }
    }

    if (entryMs < DEMO_START_MS || entryMs >= DEMO_END_MS) continue;
    let entryIndex = path.indexAt(entryMs);
    // Never open while the market is shut; wait for the next open bar.
    let guard = 0;
    while (!path.isOpen(entryIndex) && entryIndex < path.length - 2 && guard < 3000) {
      entryIndex += 1;
      guard += 1;
    }
    if (!path.isOpen(entryIndex)) continue;

    const equity = equityAt(path.timeAt(entryIndex));
    const sizingDistance =
      blueprint.slDistance > 0 ? blueprint.slDistance : blueprint.sizingDistance;
    let volume =
      fixedVolume !== null
        ? fixedVolume
        : roundVolume(
            (((blueprint.riskPercent ?? 1) / 100) * equity) /
              (sizingDistance * DEMO_CONTRACT_SIZE),
          );

    if (cohort === 'revenge') {
      // Revenge is oversized on purpose, but it does not get to end the account.
      const ceiling =
        ((REVENGE_MAX_RISK_PERCENT / 100) * equity) / (sizingDistance * DEMO_CONTRACT_SIZE);
      volume = roundVolume(Math.min(volume, ceiling));
    }

    if (guarded) {
      const previous = previousManualClose(path.timeAt(entryIndex));
      if (previous !== null && previous.netProfit < 0) {
        let cap = roundVolume(previous.volume * REVENGE_LOT_GUARD);
        if (cap > previous.volume * 1.25) cap = roundVolume(cap - 0.01);
        volume = Math.min(volume, Math.max(0.01, cap));
      }
    }

    const simulation = realize(path, blueprint, entryIndex, volume);

    const openMs = path.timeAt(simulation.entryIndex);
    const closeMs = path.timeAt(simulation.exitIndex);
    const realizedTrade: RealizedTrade = {
      blueprint,
      direction: simulation.direction,
      entryIndex: simulation.entryIndex,
      exitIndex: simulation.exitIndex,
      openMs,
      closeMs,
      openPrice: simulation.entryPrice,
      closePrice: simulation.exitPrice,
      volume,
      initialSl:
        blueprint.slDistance > 0
          ? roundTo(
              simulation.entryPrice -
                (simulation.direction === 'buy' ? 1 : -1) * blueprint.slDistance,
              DEMO_DIGITS,
            )
          : null,
      initialTp: simulation.finalTp !== 0 ? simulation.finalTp : null,
      finalSl: simulation.finalSl !== 0 ? simulation.finalSl : null,
      finalTp: simulation.finalTp !== 0 ? simulation.finalTp : null,
      grossProfit: simulation.grossProfit,
      commission: simulation.commission,
      swap: simulation.swap,
      netProfit: simulation.netProfit,
      mfePrice: simulation.mfePrice,
      maePrice: simulation.maePrice,
      spreadPointsAtEntry: path.spreadPoints(simulation.entryIndex),
      spreadPointsAtExit: path.spreadPoints(simulation.exitIndex),
      equityAtEntry: equity,
      modification: simulation.modification,
    };

    realizedById.set(blueprint.id, realizedTrade);
    realizedTrades.push(realizedTrade);
    closed.push({ closeMs, netProfit: simulation.netProfit });
    if (isManual) {
      closedManual.push({ closeMs, netProfit: simulation.netProfit, volume });
    }
  }

  realizedTrades.sort((a, b) => a.openMs - b.openMs || a.blueprint.id - b.blueprint.id);

  const trades: Trade[] = [];
  const deals: Deal[] = [];
  const modifications: SlModification[] = [];

  realizedTrades.forEach((realizedTrade, index) => {
    const positionId = POSITION_ID_BASE + index;
    const entryTicket = DEAL_TICKET_BASE + index * 2;
    const exitTicket = entryTicket + 1;
    const sideCommission = roundTo(realizedTrade.commission / 2, 2);
    const opposite: TradeDirection = realizedTrade.direction === 'buy' ? 'sell' : 'buy';

    trades.push({
      id: `T-${positionId}`,
      positionId,
      symbol: DEMO_SYMBOL,
      magic: realizedTrade.blueprint.magic,
      comment: realizedTrade.blueprint.comment,
      direction: realizedTrade.direction,
      volume: realizedTrade.volume,
      openTime: toIso(realizedTrade.openMs),
      closeTime: toIso(realizedTrade.closeMs),
      openPrice: realizedTrade.openPrice,
      closePrice: realizedTrade.closePrice,
      initialSl: realizedTrade.initialSl,
      initialTp: realizedTrade.initialTp,
      finalSl: realizedTrade.finalSl,
      finalTp: realizedTrade.finalTp,
      grossProfit: realizedTrade.grossProfit,
      commission: realizedTrade.commission,
      swap: realizedTrade.swap,
      netProfit: realizedTrade.netProfit,
      mfePrice: realizedTrade.mfePrice,
      maePrice: realizedTrade.maePrice,
      spreadPointsAtEntry: realizedTrade.spreadPointsAtEntry,
      spreadPointsAtExit: realizedTrade.spreadPointsAtExit,
      equityAtEntry: realizedTrade.equityAtEntry,
      contractSize: DEMO_CONTRACT_SIZE,
      durationSeconds: Math.round((realizedTrade.closeMs - realizedTrade.openMs) / 1000),
      entryDealTicket: entryTicket,
      exitDealTicket: exitTicket,
    });

    deals.push({
      ticket: entryTicket,
      positionId,
      time: toIso(realizedTrade.openMs),
      type: realizedTrade.direction,
      entry: 'in',
      symbol: DEMO_SYMBOL,
      volume: realizedTrade.volume,
      price: realizedTrade.openPrice,
      sl: realizedTrade.initialSl ?? 0,
      tp: realizedTrade.initialTp ?? 0,
      profit: 0,
      commission: sideCommission,
      swap: 0,
      magic: realizedTrade.blueprint.magic,
      comment: realizedTrade.blueprint.comment,
      spreadPoints: realizedTrade.spreadPointsAtEntry,
    });

    deals.push({
      ticket: exitTicket,
      positionId,
      time: toIso(realizedTrade.closeMs),
      type: opposite,
      entry: 'out',
      symbol: DEMO_SYMBOL,
      volume: realizedTrade.volume,
      price: realizedTrade.closePrice,
      sl: realizedTrade.finalSl ?? 0,
      tp: realizedTrade.finalTp ?? 0,
      profit: realizedTrade.grossProfit,
      commission: roundTo(realizedTrade.commission - sideCommission, 2),
      swap: realizedTrade.swap,
      magic: realizedTrade.blueprint.magic,
      comment: realizedTrade.blueprint.comment,
      spreadPoints: realizedTrade.spreadPointsAtExit,
    });

    if (realizedTrade.modification !== null) {
      modifications.push({
        positionId,
        time: toIso(realizedTrade.modification.timeMs),
        sl: realizedTrade.modification.sl,
        tp: realizedTrade.modification.tp,
      });
    }
  });

  deals.sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.ticket - b.ticket);
  modifications.sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time) || a.positionId - b.positionId,
  );

  const finalBalance = roundTo(
    trades.reduce((sum, trade) => sum + trade.netProfit, DEMO_STARTING_BALANCE),
    2,
  );

  const account: Account = {
    login: DEMO_ACCOUNT_LOGIN,
    server: DEMO_ACCOUNT_SERVER,
    currency: DEMO_ACCOUNT_CURRENCY,
    balance: finalBalance,
    equity: finalBalance,
    leverage: DEMO_ACCOUNT_LEVERAGE,
  };

  const symbolInfo: Record<string, SymbolInfo> = {
    [DEMO_SYMBOL]: { contractSize: DEMO_CONTRACT_SIZE, digits: DEMO_DIGITS },
  };

  return {
    account,
    deals,
    modifications,
    calendar,
    symbolInfo,
    trades,
    eas: DEMO_EAS.map((ea) => ({ ...ea })),
    meta: {
      label: 'Demo data',
      seed,
      days: DEMO_DAYS,
      symbol: DEMO_SYMBOL,
      startTime: toIso(DEMO_START_MS),
      endTime: toIso(DEMO_END_MS),
      improvementPhaseStart: toIso(DEMO_IMPROVEMENT_START_MS),
      eaDriftStart: toIso(DEMO_EA_DRIFT_START_MS),
      startingBalance: DEMO_STARTING_BALANCE,
      startingPrice: DEMO_START_PRICE,
    },
  };
}
