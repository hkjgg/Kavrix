/**
 * Everything the demo's Trade Dossier reads, gathered once per process —
 * including the M1 path the chart is drawn from, which only the demo has.
 */

import type { DossierSources } from '@/components/dossier/dossier';
import { buildDossierSources } from '@/lib/views/account';
import { getDemoAssay, getDemoDataset } from './assay';
import { getDemoPricePath } from './candles';
import { DEMO_DIGITS } from './generate';
import { getDemoLedger } from './ledger';

let cached: DossierSources | null = null;

export function getDemoDossierSources(): DossierSources {
  cached ??= buildDossierSources(getDemoAssay(), getDemoDataset(), getDemoLedger().rows, {
    bars: getDemoPricePath(),
    digits: DEMO_DIGITS,
  });
  return cached;
}
