/**
 * Enrichment — turning a structural `Trade` into a measured one.
 *
 * This is the only module that reads raw positions, modifications and the
 * economic calendar. Everything downstream (Karat, Gap, Proof, Fineness,
 * findings, stats) reads `EnrichedTrade` and nothing else, which is what keeps
 * the rest of the engine free of date maths and broker trivia.
 *
 * Every rule here is CLAUDE.md §5 verbatim. Where §5 leaves a choice open, the
 * choice is made once, here, and marked "Choice:".
 */

import type { NewsEvent, SlModification, Trade } from './types';
import type { EngineSettings } from './settings';
import { clamp, round, safeDivide } from './math';
import {
  DAY_MS,
  MINUTE_MS,
  SECOND_MS,
  dayKey,
  fractionalHourOfDay,
  hourOfDay,
  isoWeekKey,
  minutesFromServerMidnight,
  toMs,
  weekdayUtc,
} from './time';

/* -------------------------------------------------------------------------
 * Sessions (CLAUDE.md §5)
 * ---------------------------------------------------------------------- */

export type SessionKey = 'asia' | 'london' | 'newYork';

export interface SessionDefinition {
  key: SessionKey;
  label: string;
  /** Inclusive start, UTC hours (fractional: 12.5 is 12:30). */
  startHour: number;
  /** Exclusive end, UTC hours. */
  endHour: number;
}

/**
 * Asia 00:00–09:00 · London 07:00–16:00 · New York 12:30–21:00, UTC.
 *
 * A trade belongs to every session its **entry** falls in, so the overlaps are
 * deliberate and a trade can carry two labels. It can also carry none: nothing
 * in §5 covers 21:00–00:00, and inventing a fourth session to cover it would
 * be inventing a metric.
 */
export const SESSIONS: readonly SessionDefinition[] = [
  { key: 'asia', label: 'Asia', startHour: 0, endHour: 9 },
  { key: 'london', label: 'London', startHour: 7, endHour: 16 },
  { key: 'newYork', label: 'New York', startHour: 12.5, endHour: 21 },
];

/** Sessions containing a UTC instant. */
export function sessionsAt(ms: number): SessionKey[] {
  const hour = fractionalHourOfDay(ms);
  return SESSIONS.filter(
    (session) => hour >= session.startHour && hour < session.endHour,
  ).map((session) => session.key);
}

/* -------------------------------------------------------------------------
 * Revenge (CLAUDE.md §6.1, pinned)
 * ---------------------------------------------------------------------- */

/**
 * Why a trade was flagged as revenge.
 *
 * `window` — opened inside the revenge window after a losing close.
 * `size`   — lot more than 1.25× the previous trade's after a loss.
 * `both`   — both triggers fired.
 */
export type RevengeReason = 'window' | 'size' | 'both';

/* -------------------------------------------------------------------------
 * Impurities
 * ---------------------------------------------------------------------- */

/** The rule violations a single trade can carry (CLAUDE.md §10: "impurity"). */
export type ImpurityKind =
  | 'revenge'
  | 'news'
  | 'rollover'
  | 'oversized'
  | 'noStop'
  | 'stopWidened'
  | 'exitOverrun';

/* -------------------------------------------------------------------------
 * The enriched trade
 * ---------------------------------------------------------------------- */

export interface EnrichedTrade {
  id: string;
  positionId: number;
  symbol: string;
  magic: number;
  /** `magic === 0`. Only manual trades are scored (CLAUDE.md §6). */
  isManual: boolean;
  comment: string;
  direction: 'buy' | 'sell';
  volume: number;

  openTime: string;
  closeTime: string;
  openTimeMs: number;
  closeTimeMs: number;
  /** `YYYY-MM-DD` (UTC) of the entry — the key every daily aggregate uses. */
  dayKey: string;
  /** ISO week of the entry, `YYYY-Www`. */
  isoWeek: string;
  /** UTC hour of entry, 0–23. */
  hourUtc: number;
  /** UTC weekday of entry, 0 = Sunday. */
  weekdayUtc: number;

  openPrice: number;
  closePrice: number;
  grossProfit: number;
  commission: number;
  swap: number;
  netProfit: number;
  /** `netProfit < 0` after commission and swap (CLAUDE.md §5). */
  isLoss: boolean;
  isWin: boolean;

  /** The stop that counts as the initial one: at entry, or set within 60 s. */
  initialSl: number | null;
  /** Seconds after entry the initial stop appeared. `0` when it was there at entry. */
  initialSlAfterSeconds: number | null;
  /** No stop at entry and none within 60 s (CLAUDE.md §5). */
  noStop: boolean;
  /** |entry − initial SL| × volume × contract size, or the default-risk fallback. */
  initialRiskMoney: number;
  /** Initial risk as a percentage of equity at entry. */
  riskPercent: number;
  /** Net P&L ÷ initial risk. */
  rMultiple: number;
  equityAtEntry: number;
  contractSize: number;

  durationSeconds: number;
  sessions: SessionKey[];

  /** Minutes from entry to the nearest high-impact USD release. `null` when none exist. */
  newsProximityMinutes: number | null;
  /** Signed version: negative before the release, positive after. */
  signedNewsProximityMinutes: number | null;
  nearestNewsEventId: number | null;
  nearestNewsName: string | null;
  inNewsWindow: boolean;
  /** Comment carries the `news-strategy` tag, so §6.1 exempts it. */
  newsExempt: boolean;
  inRolloverWindow: boolean;
  /** News or rollover, minus the exemption — what the Market Conditions pillar counts. */
  marketConditionFlagged: boolean;

  /** A stop was on the position within 60 s of entry. */
  slSetInTime: boolean;
  /** A stop was moved further from entry, or removed, while the position was open. */
  slWidened: boolean;
  /** Set in time **and** never widened (CLAUDE.md §6.1). */
  slCompliant: boolean;

  /** Max favourable excursion, in R. Gross: costs are not deducted from it. */
  mfeR: number;
  /** Max adverse excursion, in R. Negative. */
  maeR: number;

  revenge: boolean;
  revengeReason: RevengeReason | null;
  /** The last manual trade to close before this one opened. */
  previousTradeId: string | null;
  /** Minutes from that close to this open. */
  minutesSincePreviousClose: number | null;
  previousWasLoss: boolean;

  /** Risk over the limit (the Risk pillar's deduction trigger). */
  oversized: boolean;
  /** A loss worse than the overrun threshold (default −1.1R). */
  exitOverrun: boolean;
  impurities: ImpurityKind[];

  spreadPointsAtEntry: number;
  spreadPointsAtExit: number;
}

/* -------------------------------------------------------------------------
 * News proximity
 * ---------------------------------------------------------------------- */

interface NewsIndex {
  times: number[];
  events: NewsEvent[];
}

/** High-impact USD releases only (CLAUDE.md §5), sorted by time. */
export function buildNewsIndex(calendar: readonly NewsEvent[]): NewsIndex {
  const events = calendar
    .filter((event) => event.importance === 'high' && event.currency === 'USD')
    .slice()
    .sort((a, b) => toMs(a.time) - toMs(b.time));
  return { times: events.map((event) => toMs(event.time)), events };
}

/** Nearest release to an instant, by binary search. `null` when the calendar is empty. */
function nearestNews(
  index: NewsIndex,
  ms: number,
): { event: NewsEvent; signedMinutes: number } | null {
  const { times, events } = index;
  if (times.length === 0) return null;

  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((times[middle] ?? 0) < ms) low = middle + 1;
    else high = middle;
  }

  let best = low;
  const previous = low - 1;
  if (
    previous >= 0 &&
    Math.abs(ms - (times[previous] ?? 0)) < Math.abs(ms - (times[low] ?? 0))
  ) {
    best = previous;
  }

  const event = events[best];
  const time = times[best];
  if (event === undefined || time === undefined) return null;
  return { event, signedMinutes: (ms - time) / MINUTE_MS };
}

/* -------------------------------------------------------------------------
 * Stops
 * ---------------------------------------------------------------------- */

interface StopFacts {
  initialSl: number | null;
  initialSlAfterSeconds: number | null;
  widened: boolean;
}

/**
 * What the stop did while the position was open.
 *
 * "Initial SL" is the stop at entry, or — per §5 — one attached within 60 s.
 * "Widened" means a stop was put further from entry than it already was, or
 * removed altogether.
 *
 * Choice: the comparison is against the *running* stop, not the original one,
 * so pulling a stop to breakeven and then back out to its old distance is a
 * widening. Trailing a stop closer is never penalised.
 */
function readStopFacts(
  trade: Trade,
  modifications: readonly SlModification[],
  settings: EngineSettings,
): StopFacts {
  const openMs = toMs(trade.openTime);
  const closeMs = toMs(trade.closeTime);
  const graceMs = settings.stopSetWithinSeconds * SECOND_MS;

  const ordered = modifications
    .slice()
    .sort((a, b) => toMs(a.time) - toMs(b.time))
    .filter((modification) => {
      const ms = toMs(modification.time);
      return ms >= openMs && ms <= closeMs;
    });

  let initialSl = trade.initialSl;
  let initialSlAfterSeconds: number | null = initialSl === null ? null : 0;

  // A stop attached inside the grace window still counts as the initial one.
  if (initialSl === null) {
    for (const modification of ordered) {
      const ms = toMs(modification.time);
      if (ms - openMs > graceMs) break;
      if (modification.sl !== 0) {
        initialSl = modification.sl;
        initialSlAfterSeconds = (ms - openMs) / SECOND_MS;
        break;
      }
    }
  }

  let widened = false;
  if (initialSl !== null) {
    let currentDistance = Math.abs(trade.openPrice - initialSl);
    for (const modification of ordered) {
      const ms = toMs(modification.time);
      // Anything inside the grace window is part of setting the stop up.
      if (ms - openMs <= graceMs) continue;
      if (modification.sl === 0) {
        widened = true; // The stop was removed — the worst widening there is.
        break;
      }
      const distance = Math.abs(trade.openPrice - modification.sl);
      if (distance > currentDistance + settings.stopMoveEpsilon) {
        widened = true;
        break;
      }
      currentDistance = distance;
    }
  }

  return { initialSl, initialSlAfterSeconds, widened };
}

/* -------------------------------------------------------------------------
 * Enrichment
 * ---------------------------------------------------------------------- */

export interface EnrichInput {
  trades: readonly Trade[];
  modifications: readonly SlModification[];
  calendar: readonly NewsEvent[];
}

/**
 * Measures every trade. The result is sorted by entry time, which is the order
 * the revenge rule, the daily aggregates and the equity curve all assume.
 */
export function enrichTrades(
  input: EnrichInput,
  settings: EngineSettings,
): EnrichedTrade[] {
  const newsIndex = buildNewsIndex(input.calendar);

  const modificationsByPosition = new Map<number, SlModification[]>();
  for (const modification of input.modifications) {
    const list = modificationsByPosition.get(modification.positionId);
    if (list === undefined) modificationsByPosition.set(modification.positionId, [modification]);
    else list.push(modification);
  }

  const ordered = input.trades
    .slice()
    .sort((a, b) => toMs(a.openTime) - toMs(b.openTime) || a.id.localeCompare(b.id));

  const enriched: EnrichedTrade[] = ordered.map((trade) => {
    const openTimeMs = toMs(trade.openTime);
    const closeTimeMs = toMs(trade.closeTime);
    const isManual = trade.magic === 0;

    const stops = readStopFacts(
      trade,
      modificationsByPosition.get(trade.positionId) ?? [],
      settings,
    );
    const noStop = stops.initialSl === null;

    // §5: risk is the distance to the initial stop; without one, the user's
    // default risk stands in as the R denominator and the trade is marked.
    const initialRiskMoney = noStop
      ? (settings.defaultRiskPercent / 100) * trade.equityAtEntry
      : Math.abs(trade.openPrice - (stops.initialSl ?? 0)) *
        trade.volume *
        trade.contractSize;

    const riskPercent = safeDivide(initialRiskMoney * 100, trade.equityAtEntry, 0);
    const rMultiple = safeDivide(trade.netProfit, initialRiskMoney, 0);

    const news = nearestNews(newsIndex, openTimeMs);
    const newsExempt = trade.comment
      .toLowerCase()
      .includes(settings.newsStrategyTag.toLowerCase());
    const proximity = news === null ? null : Math.abs(news.signedMinutes);
    const inNewsWindow =
      proximity !== null && proximity <= settings.newsWindowMinutes;
    const inRolloverWindow =
      minutesFromServerMidnight(openTimeMs, settings.serverUtcOffsetHours) <=
      settings.rolloverWindowMinutes;

    const sign = trade.direction === 'buy' ? 1 : -1;
    const excursionMoney = (price: number): number =>
      (price - trade.openPrice) * sign * trade.volume * trade.contractSize;

    const isLoss = trade.netProfit < 0;
    const oversized = riskPercent > settings.riskLimitPercent;
    const exitOverrun = isLoss && rMultiple < settings.exitOverrunR;
    const marketConditionFlagged = !newsExempt && (inNewsWindow || inRolloverWindow);

    const impurities: ImpurityKind[] = [];
    if (inNewsWindow && !newsExempt) impurities.push('news');
    if (inRolloverWindow && !newsExempt) impurities.push('rollover');
    if (oversized) impurities.push('oversized');
    if (noStop) impurities.push('noStop');
    if (stops.widened) impurities.push('stopWidened');
    if (exitOverrun) impurities.push('exitOverrun');

    return {
      id: trade.id,
      positionId: trade.positionId,
      symbol: trade.symbol,
      magic: trade.magic,
      isManual,
      comment: trade.comment,
      direction: trade.direction,
      volume: trade.volume,

      openTime: trade.openTime,
      closeTime: trade.closeTime,
      openTimeMs,
      closeTimeMs,
      dayKey: dayKey(openTimeMs),
      isoWeek: isoWeekKey(openTimeMs),
      hourUtc: hourOfDay(openTimeMs),
      weekdayUtc: weekdayUtc(openTimeMs),

      // Money is copied through `round` rather than raw: it is already at the
      // broker's precision, and rounding is what strips a −0 that would not
      // survive a JSON round trip.
      openPrice: round(trade.openPrice, 5),
      closePrice: round(trade.closePrice, 5),
      grossProfit: round(trade.grossProfit, 2),
      commission: round(trade.commission, 2),
      swap: round(trade.swap, 2),
      netProfit: round(trade.netProfit, 2),
      isLoss,
      isWin: trade.netProfit > 0,

      initialSl: stops.initialSl,
      initialSlAfterSeconds: stops.initialSlAfterSeconds,
      noStop,
      initialRiskMoney: round(initialRiskMoney, 2),
      riskPercent: round(riskPercent, 4),
      rMultiple: round(rMultiple, 4),
      equityAtEntry: round(trade.equityAtEntry, 2),
      contractSize: trade.contractSize,

      durationSeconds: trade.durationSeconds,
      sessions: sessionsAt(openTimeMs),

      newsProximityMinutes: proximity === null ? null : round(proximity, 2),
      signedNewsProximityMinutes:
        news === null ? null : round(news.signedMinutes, 2),
      nearestNewsEventId: news?.event.eventId ?? null,
      nearestNewsName: news?.event.name ?? null,
      inNewsWindow,
      newsExempt,
      inRolloverWindow,
      marketConditionFlagged,

      slSetInTime: !noStop,
      slWidened: stops.widened,
      slCompliant: !noStop && !stops.widened,

      mfeR: round(safeDivide(excursionMoney(trade.mfePrice), initialRiskMoney, 0), 4),
      maeR: round(safeDivide(excursionMoney(trade.maePrice), initialRiskMoney, 0), 4),

      revenge: false,
      revengeReason: null,
      previousTradeId: null,
      minutesSincePreviousClose: null,
      previousWasLoss: false,

      oversized,
      exitOverrun,
      impurities,

      spreadPointsAtEntry: trade.spreadPointsAtEntry,
      spreadPointsAtExit: trade.spreadPointsAtExit,
    };
  });

  applyRevenge(enriched, settings);
  return enriched;
}

/**
 * Flags revenge trades in place (CLAUDE.md §6.1).
 *
 * Pinned definition: the **previous trade** is the last *manual* trade that
 * **closed** before this trade **opened**, and the lot comparison uses that
 * trade. Both triggers are measured against it:
 *
 *  1. it closed at a loss and this trade opened within 15 minutes of that close;
 *  2. it closed at a loss and this trade's lot is more than 1.25× its lot.
 *
 * Choice: trigger 1 does not scan further back for *any* losing close. If a
 * winner closed more recently than the loss, the trader had a clean read of the
 * market in between, and the run is broken.
 *
 * EA trades are neither flagged nor eligible to be a previous trade: §6 scores
 * manual trading only, and an EA closing a position is not a provocation.
 */
function applyRevenge(trades: EnrichedTrade[], settings: EngineSettings): void {
  const manual = trades.filter((trade) => trade.isManual);
  const byClose = manual
    .slice()
    .sort((a, b) => a.closeTimeMs - b.closeTimeMs || a.id.localeCompare(b.id));

  // `manual` is already in entry order, so one forward pointer over `byClose`
  // finds each trade's predecessor in a single pass.
  let cursor = 0;
  let previous: EnrichedTrade | null = null;

  for (const trade of manual) {
    while (cursor < byClose.length) {
      const candidate = byClose[cursor];
      if (candidate === undefined || candidate.closeTimeMs >= trade.openTimeMs) break;
      previous = candidate;
      cursor += 1;
    }
    if (previous === null || previous.id === trade.id) continue;

    const minutesSince = (trade.openTimeMs - previous.closeTimeMs) / MINUTE_MS;
    trade.previousTradeId = previous.id;
    trade.minutesSincePreviousClose = round(minutesSince, 2);
    trade.previousWasLoss = previous.isLoss;
    if (!previous.isLoss) continue;

    const inWindow = minutesSince <= settings.revengeWindowMinutes;
    const upsized = trade.volume > settings.revengeLotMultiple * previous.volume;
    if (!inWindow && !upsized) continue;

    trade.revenge = true;
    trade.revengeReason = inWindow && upsized ? 'both' : inWindow ? 'window' : 'size';
    trade.impurities.unshift('revenge');
  }
}

/* -------------------------------------------------------------------------
 * Small shared selectors
 * ---------------------------------------------------------------------- */

/** Manual trades only, in entry order — the population every pillar scores. */
export function manualTrades(trades: readonly EnrichedTrade[]): EnrichedTrade[] {
  return trades.filter((trade) => trade.isManual);
}

/** Trades whose **entry** falls in `(fromMs, toMs]`. */
export function tradesInWindow(
  trades: readonly EnrichedTrade[],
  fromMs: number,
  toMs_: number,
): EnrichedTrade[] {
  return trades.filter(
    (trade) => trade.openTimeMs > fromMs && trade.openTimeMs <= toMs_,
  );
}

/**
 * Recency weight for a trade (CLAUDE.md §6.1): exponential, half-life 10 days.
 * A trade opened today weighs 1, ten days ago 0.5, twenty days ago 0.25.
 */
export function recencyWeight(
  openTimeMs: number,
  asOfMs: number,
  halfLifeDays: number,
): number {
  const ageDays = clamp((asOfMs - openTimeMs) / DAY_MS, 0, Number.MAX_SAFE_INTEGER);
  return 0.5 ** (ageDays / halfLifeDays);
}
