/**
 * The demo account's Assay, computed once.
 *
 * `/demo` is server-rendered from this (CLAUDE.md §11): the generator and the
 * engine run on the server, and the browser receives only what the visuals
 * need. Both are pure and seeded, so the result is the same on every machine
 * and every build — which is what makes it safe to memoise for the life of the
 * process and to prerender the page at build time.
 *
 * `asOf` is the end of the demo window, never the clock: a demo whose score
 * drifts as the deploy ages is not a demo, it is a bug with a story.
 */

import type { DemoDataset } from './generate';
import { DEMO_END_MS, generateDemoData } from './generate';
import type { AssayResult } from '@/lib/engine';
import { runAccountEngine } from '@/lib/views/account';

let cachedData: DemoDataset | null = null;
let cached: AssayResult | null = null;

/** The generated account — deals, trades, calendar — memoised like the Assay. */
export function getDemoDataset(): DemoDataset {
  if (cachedData === null) cachedData = generateDemoData();
  return cachedData;
}

export function getDemoAssay(): AssayResult {
  cached ??= runAccountEngine(getDemoDataset(), {}, DEMO_END_MS);
  return cached;
}
