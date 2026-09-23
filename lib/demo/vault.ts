/**
 * The demo account's Vault, built once from the memoised Assay.
 *
 * `runEngine` replays the scored window by default (§6.11: "the Vault asks
 * for any other day on demand"). The Vault shelves the whole history, so it
 * asks: the engine's own `computeReplay` over every day, with the Assay's
 * trades and settings, and each day told by the engine's `dayStory`. Nothing
 * is re-derived — the day cells are `stats.calendarDays`, the Day Assays are
 * `DayStory`s, and the worst episode is the engine's `worstTiltEpisode`
 * across all of them.
 */

import { buildVaultView } from '@/components/vault/vault';
import type { VaultView } from '@/components/vault/vault';
import type { DayStory, EnrichedTrade, ReplayDay } from '@/lib/engine';
import { SESSIONS, computeReplay, dayStory, tierFor, worstTiltEpisode } from '@/lib/engine';
import { getDemoAssay, getDemoDataset } from './assay';

let cachedReplay: ReplayDay[] | null = null;
let cachedStories: DayStory[] | null = null;
let cached: VaultView | null = null;

/** Every day of the demo history, replayed. */
export function getDemoReplay(): ReplayDay[] {
  if (cachedReplay !== null) return cachedReplay;
  const assay = getDemoAssay();
  cachedReplay = computeReplay(assay.trades, assay.settings, { toMs: Date.parse(assay.asOf) });
  return cachedReplay;
}

/** Every day of the demo history, told as a Day Assay. */
export function getDemoDayStories(): DayStory[] {
  if (cachedStories !== null) return cachedStories;
  const assay = getDemoAssay();
  const calendar = getDemoDataset().calendar;
  const byDay = new Map<string, EnrichedTrade[]>();
  for (const trade of assay.trades) {
    if (!trade.isManual) continue;
    const list = byDay.get(trade.dayKey);
    if (list === undefined) byDay.set(trade.dayKey, [trade]);
    else list.push(trade);
  }
  cachedStories = getDemoReplay().map((day) =>
    dayStory({
      day,
      trades: byDay.get(day.date) ?? [],
      calendar,
      settings: assay.settings,
      currency: assay.account.currency,
    }),
  );
  return cachedStories;
}

export function getDemoVault(): VaultView {
  if (cached !== null) return cached;

  const assay = getDemoAssay();
  const replay = getDemoReplay();
  const firstOpen = assay.trades.reduce(
    (earliest, trade) => Math.min(earliest, trade.openTimeMs),
    Date.parse(assay.asOf),
  );
  const worst = worstTiltEpisode(replay);

  cached = buildVaultView({
    calendarDays: assay.stats.calendarDays,
    stories: getDemoDayStories(),
    firstDate: new Date(firstOpen).toISOString().slice(0, 10),
    lastDate: assay.asOf.slice(0, 10),
    currency: assay.account.currency,
    worst: worst === null ? null : { date: worst.date, start: worst.episode.start },
    tierOf: (karat) => tierFor(karat).label,
    sessions: SESSIONS,
  });
  return cached;
}
