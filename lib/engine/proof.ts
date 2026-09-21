/**
 * Your Proof (CLAUDE.md §6.4) — the card that shows discipline paid.
 *
 * Weeks are scored, bucketed by Karat, and the two buckets' average weekly R
 * are compared. The card stays hidden unless both buckets hold at least three
 * weeks: with fewer, the difference is an anecdote, and §2 does not allow the
 * product to sell an anecdote as evidence.
 */

import type { EnrichedTrade } from './enrich';
import { manualTrades } from './enrich';
import { karatFromPoints, pointsFromPillars, scorePillars } from './karat';
import { mean, round, sum } from './math';
import type { EngineSettings } from './settings';
import { isoWeekStartMs, toIso } from './time';

export type ProofBucketKey = 'high' | 'low' | 'middle';

export interface ProofWeek {
  /** `YYYY-Www`. */
  isoWeek: string;
  /** Midnight UTC on the Monday that opens the week. */
  weekStart: string;
  tradeCount: number;
  karat: number;
  points: number;
  /** Sum of R over the week's manual trades. */
  netR: number;
  netMoney: number;
  bucket: ProofBucketKey;
}

export interface ProofBucket {
  label: string;
  weekCount: number;
  /** Mean of the weeks' total R. */
  avgWeeklyR: number;
  totalR: number;
  isoWeeks: string[];
}

export interface ProofResult {
  /** Both buckets hold enough weeks (§6.4). */
  visible: boolean;
  /** Why the card is hidden, in plain words. `null` when it is visible. */
  hiddenReason: string | null;
  weeks: ProofWeek[];
  high: ProofBucket;
  low: ProofBucket;
  /** `high.avgWeeklyR − low.avgWeeklyR` — "discipline paid you X R a week". */
  differenceR: number;
  minTradesPerWeek: number;
  minWeeksPerBucket: number;
  highKarat: number;
  lowKarat: number;
}

/**
 * Weekly Karat and the two buckets.
 *
 * Choice: weekly Karat is **unweighted**. Recency inside a single week is
 * noise, and a week has to be judged as a whole for two weeks to be
 * comparable.
 *
 * Choice: weeks with fewer than five manual trades are dropped entirely rather
 * than bucketed — one trade can score 24K or 0K, and either would poison the
 * average it lands in.
 */
export function computeProof(
  trades: readonly EnrichedTrade[],
  settings: EngineSettings,
): ProofResult {
  const byWeek = new Map<string, EnrichedTrade[]>();
  for (const trade of manualTrades(trades)) {
    const list = byWeek.get(trade.isoWeek);
    if (list === undefined) byWeek.set(trade.isoWeek, [trade]);
    else list.push(trade);
  }

  const weeks: ProofWeek[] = [];
  for (const [isoWeek, weekTrades] of [...byWeek.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (weekTrades.length < settings.proofMinTradesPerWeek) continue;

    const points = pointsFromPillars(scorePillars(weekTrades, settings));
    const karat = karatFromPoints(points);
    const bucket: ProofBucketKey =
      karat >= settings.proofHighKarat
        ? 'high'
        : karat < settings.proofLowKarat
          ? 'low'
          : 'middle';

    weeks.push({
      isoWeek,
      weekStart: toIso(isoWeekStartMs(weekTrades[0]?.openTimeMs ?? 0)),
      tradeCount: weekTrades.length,
      karat,
      points,
      netR: round(sum(weekTrades.map((trade) => trade.rMultiple)), 2),
      netMoney: round(sum(weekTrades.map((trade) => trade.netProfit)), 2),
      bucket,
    });
  }

  const build = (key: ProofBucketKey, label: string): ProofBucket => {
    const own = weeks.filter((week) => week.bucket === key);
    return {
      label,
      weekCount: own.length,
      avgWeeklyR: round(mean(own.map((week) => week.netR)), 2),
      totalR: round(sum(own.map((week) => week.netR)), 2),
      isoWeeks: own.map((week) => week.isoWeek),
    };
  };

  const high = build('high', `${settings.proofHighKarat}K and above`);
  const low = build('low', `Under ${settings.proofLowKarat}K`);
  const enough =
    high.weekCount >= settings.proofMinWeeksPerBucket &&
    low.weekCount >= settings.proofMinWeeksPerBucket;

  return {
    visible: enough,
    hiddenReason: enough
      ? null
      : `Needs ${settings.proofMinWeeksPerBucket} weeks in each bucket · ${high.weekCount} disciplined, ${low.weekCount} impure`,
    weeks,
    high,
    low,
    differenceR: enough ? round(high.avgWeeklyR - low.avgWeeklyR, 2) : 0,
    minTradesPerWeek: settings.proofMinTradesPerWeek,
    minWeeksPerBucket: settings.proofMinWeeksPerBucket,
    highKarat: settings.proofHighKarat,
    lowKarat: settings.proofLowKarat,
  };
}
