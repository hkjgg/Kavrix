/**
 * Discipline Replay (CLAUDE.md §6.11) — a day, trade by trade.
 *
 * The Assay Dial answers "how disciplined am I". The Replay answers "where did
 * today go wrong", which is a different question and usually a more useful one:
 * it walks a single UTC day in order, re-scores the day after every trade, and
 * marks the runs where the wheels came off.
 *
 * A **tilt episode** is two or more impurities inside 60 minutes. That is the
 * shape indiscipline actually has — not one bad trade, but a stretch of them,
 * each one following from the last.
 *
 * The day's Karat here is the day's own trades, unweighted, exactly as the
 * Vault engraves it (`stats.ts`). It is a mark on a day, not the score; the
 * score is the 30-day window in `series.ts`.
 */

import type { EnrichedTrade, ImpurityKind } from './enrich';
import { manualTrades } from './enrich';
import { attributeCost } from './gap';
import type { GapPillar } from './gap';
import { karatFromPoints, pointsFromPillars, scorePillars } from './karat';
import { round, sum } from './math';
import type { EngineSettings } from './settings';
import { MINUTE_MS } from './time';

/** A day with no trades in it has nothing to fault, so it opens at 24K. */
export const DAY_OPENING_KARAT = 24;

export interface ReplayImpurity {
  kind: ImpurityKind;
  /** The same words the pillar deduction uses (§6.5). */
  reason: string;
}

export interface ReplayTrade {
  tradeId: string;
  /** 1-based position in the day. */
  index: number;
  openTime: string;
  closeTime: string;
  direction: 'buy' | 'sell';
  volume: number;
  riskPercent: number;
  rMultiple: number;
  netProfit: number;
  impurities: ReplayImpurity[];
  /** Day Karat before this trade — 24.0 for the first trade of the day. */
  karatBefore: number;
  /** Day Karat counting every trade up to and including this one. */
  karatAfter: number;
  /** `karatAfter − karatBefore`. Negative is a fall. */
  karatChange: number;
  /** Minutes since the previous trade of the day opened. `null` for the first. */
  minutesSincePrevious: number | null;
  /** What the Gap bills this trade, if anything (§6.3). */
  costMoney: number;
  costPillar: GapPillar | null;
}

export interface TiltEpisode {
  /** Entry time of the first impurity in the run. */
  start: string;
  /** Entry time of the last. */
  end: string;
  durationMinutes: number;
  tradeIds: string[];
  impurityTradeCount: number;
  /** Karat before the run started, minus Karat after it ended. Positive is a fall. */
  karatDrop: number;
  karatBefore: number;
  karatAfter: number;
  costMoney: number;
  costR: number;
  netProfit: number;
}

export interface ReplayDay {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  tradeCount: number;
  impurityTradeCount: number;
  netMoney: number;
  netR: number;
  /** The day's closing Karat — the Vault's engraving. */
  karat: number;
  trades: ReplayTrade[];
  episodes: TiltEpisode[];
}

export interface ReplayOptions {
  /** Only days at or after this instant. */
  fromMs?: number;
  /** Only days at or before this instant. */
  toMs?: number;
}

const IMPURITY_REASONS: Record<ImpurityKind, string> = {
  revenge: 'Opened after a loss, in the revenge window or upsized',
  news: 'Entered inside a high-impact USD news window',
  rollover: 'Entered in the rollover window',
  oversized: 'Risk above the limit',
  noStop: 'Opened without a stop',
  stopWidened: 'Stop moved further from entry',
  exitOverrun: 'Loss ran past the overrun threshold',
};

/**
 * The replay for every UTC day in range.
 *
 * Manual trades only: a day's Karat is the trader's, and an EA firing in the
 * middle of a tilt episode is not part of it (§6).
 */
export function computeReplay(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
  options: ReplayOptions = {},
): ReplayDay[] {
  const fromMs = options.fromMs ?? Number.NEGATIVE_INFINITY;
  const toMs = options.toMs ?? Number.POSITIVE_INFINITY;

  const byDay = new Map<string, EnrichedTrade[]>();
  for (const trade of manualTrades(trades)) {
    if (trade.openTimeMs < fromMs || trade.openTimeMs > toMs) continue;
    const list = byDay.get(trade.dayKey);
    if (list === undefined) byDay.set(trade.dayKey, [trade]);
    else list.push(trade);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayTrades]) => replayDay(date, dayTrades, settings));
}

/** The replay for one day's trades, which must already be in entry order. */
export function replayDay(
  date: string,
  dayTrades: readonly EnrichedTrade[],
  settings: EngineSettings,
): ReplayDay {
  const ordered = dayTrades
    .slice()
    .sort((a, b) => a.openTimeMs - b.openTimeMs || a.id.localeCompare(b.id));

  const replayTrades: ReplayTrade[] = [];
  let karatBefore = DAY_OPENING_KARAT;

  for (let index = 0; index < ordered.length; index += 1) {
    const trade = ordered[index];
    if (trade === undefined) continue;
    const karatAfter = karatFromPoints(
      pointsFromPillars(scorePillars(ordered.slice(0, index + 1), settings)),
    );
    const attribution = attributeCost(trade, settings);
    const previous = index === 0 ? null : ordered[index - 1];

    replayTrades.push({
      tradeId: trade.id,
      index: index + 1,
      openTime: trade.openTime,
      closeTime: trade.closeTime,
      direction: trade.direction,
      volume: trade.volume,
      riskPercent: trade.riskPercent,
      rMultiple: trade.rMultiple,
      netProfit: trade.netProfit,
      impurities: trade.impurities.map((kind) => ({
        kind,
        reason: IMPURITY_REASONS[kind],
      })),
      karatBefore,
      karatAfter,
      karatChange: round(karatAfter - karatBefore, 1),
      minutesSincePrevious:
        previous === undefined || previous === null
          ? null
          : round((trade.openTimeMs - previous.openTimeMs) / MINUTE_MS, 1),
      costMoney: attribution?.costMoney ?? 0,
      costPillar: attribution?.pillar ?? null,
    });
    karatBefore = karatAfter;
  }

  return {
    date,
    tradeCount: ordered.length,
    impurityTradeCount: ordered.filter((trade) => trade.impurities.length > 0).length,
    netMoney: round(sum(ordered.map((trade) => trade.netProfit)), 2),
    netR: round(sum(ordered.map((trade) => trade.rMultiple)), 2),
    karat:
      ordered.length === 0
        ? DAY_OPENING_KARAT
        : karatFromPoints(pointsFromPillars(scorePillars(ordered, settings))),
    trades: replayTrades,
    episodes: findTiltEpisodes(ordered, replayTrades, settings),
  };
}

/**
 * Runs of impurities close together (§6.11).
 *
 * The chain is measured between consecutive **impurity** entries: three bad
 * trades at 09:00, 09:50 and 10:40 are one episode, because each followed the
 * last inside the window, even though the first and last are 100 minutes
 * apart. That is how tilt actually runs — it does not reset on the hour.
 */
export function findTiltEpisodes(
  ordered: readonly EnrichedTrade[],
  replayTrades: readonly ReplayTrade[],
  settings: EngineSettings,
): TiltEpisode[] {
  const windowMs = settings.tiltWindowMinutes * MINUTE_MS;
  const impure = ordered
    .map((trade, index) => ({ trade, index }))
    .filter((entry) => entry.trade.impurities.length > 0);

  const runs: { trade: EnrichedTrade; index: number }[][] = [];
  let current: { trade: EnrichedTrade; index: number }[] = [];
  for (const entry of impure) {
    const last = current[current.length - 1];
    if (
      last !== undefined &&
      entry.trade.openTimeMs - last.trade.openTimeMs <= windowMs
    ) {
      current.push(entry);
    } else {
      if (current.length >= settings.tiltMinImpurities) runs.push(current);
      current = [entry];
    }
  }
  if (current.length >= settings.tiltMinImpurities) runs.push(current);

  return runs.map((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    if (first === undefined || last === undefined) {
      throw new RangeError('tilt episode built from an empty run');
    }
    const karatBefore = replayTrades[first.index]?.karatBefore ?? DAY_OPENING_KARAT;
    const karatAfter = replayTrades[last.index]?.karatAfter ?? karatBefore;
    const costs = run.map((entry) => attributeCost(entry.trade, settings));

    return {
      start: first.trade.openTime,
      end: last.trade.openTime,
      durationMinutes: round(
        (last.trade.openTimeMs - first.trade.openTimeMs) / MINUTE_MS,
        1,
      ),
      tradeIds: run.map((entry) => entry.trade.id),
      impurityTradeCount: run.length,
      karatDrop: round(karatBefore - karatAfter, 1),
      karatBefore,
      karatAfter,
      costMoney: round(sum(costs.map((cost) => cost?.costMoney ?? 0)), 2),
      costR: round(sum(costs.map((cost) => cost?.costR ?? 0)), 2),
      netProfit: round(sum(run.map((entry) => entry.trade.netProfit)), 2),
    };
  });
}

/** The worst episode in a set of days, by Karat drop then by cost. */
export function worstTiltEpisode(
  days: readonly ReplayDay[],
): { date: string; episode: TiltEpisode } | null {
  let worst: { date: string; episode: TiltEpisode } | null = null;
  for (const day of days) {
    for (const episode of day.episodes) {
      if (
        worst === null ||
        episode.karatDrop > worst.episode.karatDrop ||
        (episode.karatDrop === worst.episode.karatDrop &&
          episode.costMoney > worst.episode.costMoney)
      ) {
        worst = { date: day.date, episode };
      }
    }
  }
  return worst;
}
