/**
 * Everything the demo's Trade Dossier reads, gathered once per process.
 *
 * The Assay, the Ledger rows, the raw positions (for deal tickets and the
 * excursion prices), the entry volatilities Similar Trades needs, and the M1
 * path the chart is drawn from — each memoised, because a Dossier is rendered
 * on request and none of them ever changes.
 */

import type { DossierSources } from '@/components/dossier/dossier';
import { entryVolatilities } from '@/lib/engine/similar';
import { getDemoAssay, getDemoDataset } from './assay';
import { getDemoPricePath } from './candles';
import { DEMO_DIGITS } from './generate';
import { getDemoLedger } from './ledger';

let cached: DossierSources | null = null;

export function getDemoDossierSources(): DossierSources {
  if (cached !== null) return cached;
  const assay = getDemoAssay();
  const data = getDemoDataset();
  cached = {
    assay,
    rows: getDemoLedger().rows,
    rawTrades: new Map(data.trades.map((trade) => [trade.id, trade])),
    modifications: data.modifications,
    calendar: data.calendar,
    volatilities: entryVolatilities(assay.trades, assay.settings.similarVolatilityLookback),
    bars: getDemoPricePath(),
    digits: DEMO_DIGITS,
  };
  return cached;
}
