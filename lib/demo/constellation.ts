/**
 * The demo account's Constellation, built once from the memoised Assay. The
 * force layout runs here, on the server, at build time — the browser receives
 * frozen coordinates.
 */

import type { ConstellationView } from '@/components/constellation/constellation';
import { buildConstellation } from '@/lib/views/account';
import { getDemoAssay } from './assay';

let cached: ConstellationView | null = null;

export function getDemoConstellation(): ConstellationView {
  cached ??= buildConstellation(getDemoAssay());
  return cached;
}
