/**
 * The demo account's Ledger rows, built once from the memoised Assay
 * (`buildLedger`: the engine's own trades, deal tickets joined back on).
 */

import type { LedgerData } from '@/lib/views/account';
import { buildLedger } from '@/lib/views/account';
import { getDemoAssay, getDemoDataset } from './assay';

export type { LedgerContext, LedgerSourceOption } from '@/lib/views/account';

let cached: LedgerData | null = null;

export function getDemoLedger(): LedgerData {
  cached ??= buildLedger(getDemoAssay(), getDemoDataset());
  return cached;
}
