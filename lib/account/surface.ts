/**
 * What a signed-in page draws: the account's Assay, or the reason there is
 * nothing to draw yet. Server-only; memoised per request.
 */

import { cache } from 'react';
import type { AssayResult } from '@/lib/engine';
import type { AccountDataset } from '@/lib/views/account';
import { runAccountEngine } from '@/lib/views/account';
import type { Workspace } from './load';
import { loadAccountDataset, requireWorkspace } from './load';

export type AccountSurface =
  | { kind: 'ready'; workspace: Workspace; dataset: AccountDataset; assay: AssayResult; asOfMs: number }
  | { kind: 'empty'; workspace: Workspace; reason: 'no-account' | 'no-trades' };

export const loadAccountSurface = cache(async (): Promise<AccountSurface> => {
  const workspace = await requireWorkspace();
  if (workspace.account === null) return { kind: 'empty', workspace, reason: 'no-account' };
  const dataset = await loadAccountDataset(workspace.account.id);
  if (dataset === null || dataset.trades.length === 0) return { kind: 'empty', workspace, reason: 'no-trades' };

  // A real account is assayed as of now: its rolling window ends today.
  const asOfMs = workspace.nowMs;
  return { kind: 'ready', workspace, dataset, assay: runAccountEngine(dataset, workspace.engineSettings, asOfMs), asOfMs };
});
