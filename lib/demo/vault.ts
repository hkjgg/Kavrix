/**
 * The demo account's Vault, built once from the memoised Assay.
 *
 * `runEngine` replays the scored window by default (§6.11: "the Vault asks
 * for any other day on demand"). The Vault shelves the whole history, so it
 * asks: the engine's own `computeReplay` over every day, with the Assay's
 * trades and settings. Nothing is re-derived — the day cells are
 * `stats.calendarDays`, the timelines are `ReplayDay`s, and the worst episode
 * is the engine's `worstTiltEpisode` across all of them.
 */

import { buildVaultView } from '@/components/vault/vault';
import type { VaultView } from '@/components/vault/vault';
import type { ReplayDay } from '@/lib/engine';
import { GAP_PILLAR_LABELS, computeReplay, worstTiltEpisode } from '@/lib/engine';
import type { GapPillar } from '@/lib/engine/gap';
import { getDemoAssay } from './assay';

let cachedReplay: ReplayDay[] | null = null;
let cached: VaultView | null = null;

/** Every day of the demo history, replayed. */
export function getDemoReplay(): ReplayDay[] {
  if (cachedReplay !== null) return cachedReplay;
  const assay = getDemoAssay();
  cachedReplay = computeReplay(assay.trades, assay.settings, { toMs: Date.parse(assay.asOf) });
  return cachedReplay;
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
    replay,
    firstDate: new Date(firstOpen).toISOString().slice(0, 10),
    lastDate: assay.asOf.slice(0, 10),
    currency: assay.account.currency,
    worst: worst === null ? null : { date: worst.date, start: worst.episode.start },
    billedTo: (pillar) => GAP_PILLAR_LABELS[pillar as GapPillar],
  });
  return cached;
}
