/**
 * The demo account's Vault, built once from the memoised Assay.
 *
 * The Vault shelves the whole history, so every day is replayed by the
 * engine's own `computeReplay` and told by its `dayStory` (see
 * `lib/views/account.ts`). Nothing is re-derived.
 */

import type { VaultView } from '@/components/vault/vault';
import type { DayStory, ReplayDay } from '@/lib/engine';
import { buildVault, dayStories, replayAllDays } from '@/lib/views/account';
import { getDemoAssay, getDemoDataset } from './assay';

let cachedReplay: ReplayDay[] | null = null;
let cachedStories: DayStory[] | null = null;
let cached: VaultView | null = null;

/** Every day of the demo history, replayed. */
export function getDemoReplay(): ReplayDay[] {
  cachedReplay ??= replayAllDays(getDemoAssay());
  return cachedReplay;
}

/** Every day of the demo history, told as a Day Assay. */
export function getDemoDayStories(): DayStory[] {
  cachedStories ??= dayStories(getDemoAssay(), getDemoReplay(), getDemoDataset().calendar);
  return cachedStories;
}

export function getDemoVault(): VaultView {
  cached ??= buildVault(getDemoAssay(), getDemoReplay(), getDemoDayStories());
  return cached;
}
