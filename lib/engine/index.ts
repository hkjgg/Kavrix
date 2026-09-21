/**
 * The Kavrix analytics engine (CLAUDE.md §2: "Engine first, AI second").
 *
 * `runEngine` is the only entry point the product needs: give it an account's
 * data, the user's thresholds and an explicit "now", and it returns one
 * JSON-serializable object holding every number the UI draws. Nothing in this
 * folder performs I/O, reads the clock, or asks a model anything.
 *
 * The result is what Stage 8 will write into `karat_snapshots` after each
 * ingest batch (§13), and what `/demo` computes on the fly.
 */

import type { Account, Ea, NewsEvent, SlModification, SymbolInfo, Trade } from './types';
import type { EnrichedTrade } from './enrich';
import { enrichTrades } from './enrich';
import type { KaratResult } from './karat';
import { computeKarat } from './karat';
import type { KaratDelta, KaratSeriesPoint } from './series';
import { computeKaratSeries, karatDelta } from './series';
import type { KaratGapResult } from './gap';
import { computeKaratGap } from './gap';
import type { ProofResult } from './proof';
import { computeProof } from './proof';
import type { ConstellationResult } from './ea';
import { computeConstellation } from './ea';
import type { StatsResult } from './stats';
import { computeStats } from './stats';
import type { Finding } from './findings';
import { computeFindings } from './findings';
import type { EngineSettings } from './settings';
import { resolveSettings } from './settings';
import { DAY_MS, normalizeAsOf, toIso } from './time';

export interface EngineInput {
  account: Account;
  trades: readonly Trade[];
  modifications: readonly SlModification[];
  calendar: readonly NewsEvent[];
  eas: readonly Ea[];
  symbolInfo?: Record<string, SymbolInfo>;
}

export interface AssayResult {
  /** The "now" this result was computed against. Never the machine clock. */
  asOf: string;
  account: {
    login: number;
    server: string;
    currency: string;
  };
  settings: EngineSettings;
  counts: {
    trades: number;
    manualTrades: number;
    eaTrades: number;
    newsEvents: number;
    modifications: number;
  };
  /** The score, over the rolling window ending at `asOf` (§6.1). */
  karat: KaratResult;
  /** Week-on-week move, for the dial's delta (§8.1). */
  delta: KaratDelta;
  /** Daily Karat over the whole history, for the Purity Line (§8.4). */
  series: KaratSeriesPoint[];
  /** The Gap over the scored window — the number shown next to the dial (§6.3). */
  gap: KaratGapResult;
  /** The Gap over everything, for the Refinery bars. */
  gapAllTime: KaratGapResult;
  proof: ProofResult;
  constellation: ConstellationResult;
  stats: StatsResult;
  findings: Finding[];
  /** Every measured trade — the Ledger, the Hallmarks and the Dossier read these. */
  trades: EnrichedTrade[];
}

/**
 * Runs the whole engine.
 *
 * `asOf` is explicit and mandatory: it fixes the rolling window, the recency
 * weights and the end of every series, and it is what makes two runs over the
 * same data identical forever.
 *
 * Trades opened after `asOf` are dropped rather than scored — a snapshot must
 * not know about a trade that had not happened yet.
 */
export function runEngine(
  input: EngineInput,
  settings: Partial<EngineSettings> = {},
  asOf: string | number,
): AssayResult {
  const resolved = resolveSettings(settings);
  const asOfMs = normalizeAsOf(asOf);

  const enriched = enrichTrades(
    {
      trades: input.trades,
      modifications: input.modifications,
      calendar: input.calendar,
    },
    resolved,
  ).filter((trade) => trade.openTimeMs <= asOfMs);

  const currency = input.account.currency;
  const karat = computeKarat(enriched, resolved, asOfMs);
  const windowStartMs = asOfMs - resolved.rollingWindowDays * DAY_MS;
  const windowTrades = enriched.filter(
    (trade) => trade.openTimeMs > windowStartMs && trade.openTimeMs <= asOfMs,
  );

  const gap = computeKaratGap(windowTrades, resolved, currency);
  const gapAllTime = computeKaratGap(enriched, resolved, currency);
  const constellation = computeConstellation(enriched, input.eas, resolved);

  return {
    asOf: toIso(asOfMs),
    account: {
      login: input.account.login,
      server: input.account.server,
      currency,
    },
    settings: resolved,
    counts: {
      trades: enriched.length,
      manualTrades: enriched.filter((trade) => trade.isManual).length,
      eaTrades: enriched.filter((trade) => !trade.isManual).length,
      newsEvents: input.calendar.filter(
        (event) => event.importance === 'high' && event.currency === 'USD',
      ).length,
      modifications: input.modifications.length,
    },
    karat,
    delta: karatDelta(enriched, resolved, asOfMs),
    series: computeKaratSeries(enriched, resolved, asOfMs),
    gap,
    gapAllTime,
    proof: computeProof(enriched, resolved),
    constellation,
    stats: computeStats(enriched, resolved),
    findings: computeFindings({
      trades: enriched,
      gap: gapAllTime,
      constellation,
      settings: resolved,
      currency,
    }),
    trades: enriched,
  };
}

/* -------------------------------------------------------------------------
 * Public surface
 * ---------------------------------------------------------------------- */

export * from './types';
export * from './settings';
export * from './enrich';
export * from './karat';
export * from './series';
export * from './gap';
export * from './proof';
export * from './ea';
export * from './stats';
export * from './findings';
