/**
 * The demo account's Constellation, built once from the memoised Assay.
 *
 * Nothing is recomputed: the view is `runEngine`'s own `constellation`,
 * formatted and laid out. The force layout runs here, on the server, at build
 * time — the browser receives frozen coordinates.
 */

import { buildConstellationView } from '@/components/constellation/constellation';
import type { ConstellationView } from '@/components/constellation/constellation';
import { getDemoAssay } from './assay';

let cached: ConstellationView | null = null;

export function getDemoConstellation(): ConstellationView {
  if (cached !== null) return cached;
  const assay = getDemoAssay();
  cached = buildConstellationView({
    constellation: assay.constellation,
    settings: assay.settings,
    currency: assay.account.currency,
  });
  return cached;
}
