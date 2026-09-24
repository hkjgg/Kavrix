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
import { computeFindings, refineryTop } from './findings';
import type { BaselinesResult } from './baselines';
import { computeBaselines } from './baselines';
import type { EdgeMapResult } from './edgemap';
import { computeEdgeMap } from './edgemap';
import type { SimilarTradesResult } from './similar';
import { entryVolatilities, findSimilarTrades } from './similar';
import type { CounterfactualResult } from './counterfactual';
import { computeCounterfactual } from './counterfactual';
import type { ReplayDay } from './replay';
import { computeReplay } from './replay';
import type { PropCheckResult, PropRules } from './prop';
import { DEFAULT_PROP_RULES, computePropCheck } from './prop';
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

export interface EngineOptions {
  /**
   * The prop-firm preset the historical check is measured against (§6.12).
   * Generic by default, and never a real firm's rules.
   */
  propRules?: PropRules;
  /**
   * Trades to compute Similar Trades for (§6.9). Defaults to the single
   * costliest impurity trade in the scored window — the one the Refinery is
   * about to point at, and therefore the one a user opens first.
   */
  similarTradeIds?: readonly string[];
  /**
   * Days the Discipline Replay covers (§6.11). Defaults to the scored window:
   * the Vault asks for any other day on demand, and a year of replays is a
   * payload nobody reads.
   */
  replayDays?: number;
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
  /**
   * The three findings the Refinery leads with. Strong or Moderate only —
   * a tentative finding stays in `findings`, flagged, and never leads (§6.6).
   */
  refinery: Finding[];
  /** The trader's own normal, and where the last week left it (§6.7). */
  baselines: BaselinesResult;
  /** Where the edge is, corrected for testing twenty cells at once (§6.8). */
  edgeMap: EdgeMapResult;
  /** "You have been here before", for the trades the UI is about to show (§6.9). */
  similar: SimilarTradesResult[];
  /** The equity curve with the impurities removed — winners too (§6.10). */
  counterfactual: CounterfactualResult;
  /** The scored window, day by day, with its tilt episodes (§6.11). */
  replay: ReplayDay[];
  /** Which days would have breached a preset, historically (§6.12). */
  prop: PropCheckResult;
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
  options: EngineOptions = {},
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

  /* — Stage 2.5: statistical intelligence (§6.6–§6.12) — */
  const baselines = computeBaselines(enriched, resolved, asOfMs);
  const findings = computeFindings({
    trades: enriched,
    gap: gapAllTime,
    constellation,
    settings: resolved,
    currency,
    baselines,
  });

  // Similar Trades: the costliest impurity in the window by default, because
  // it is the trade the Refinery is about to point at.
  const costliest = gap.attributions
    .slice()
    .sort((a, b) => b.costMoney - a.costMoney || a.tradeId.localeCompare(b.tradeId))[0];
  const similarIds =
    options.similarTradeIds ??
    (costliest === undefined ? [] : [costliest.tradeId]);
  const volatilities = entryVolatilities(enriched, resolved.similarVolatilityLookback);
  const byId = new Map(enriched.map((trade) => [trade.id, trade]));
  const similar = similarIds
    .map((id) => byId.get(id))
    .filter((trade): trade is EnrichedTrade => trade !== undefined)
    .map((trade) => findSimilarTrades(trade, enriched, resolved, { volatilities }));

  const replayDays = options.replayDays ?? resolved.rollingWindowDays;

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
    findings,
    refinery: refineryTop(findings),
    baselines,
    edgeMap: computeEdgeMap(enriched, resolved),
    similar,
    counterfactual: computeCounterfactual(enriched, resolved, currency),
    replay: computeReplay(enriched, resolved, {
      fromMs: asOfMs - replayDays * DAY_MS,
      toMs: asOfMs,
    }),
    prop: computePropCheck(
      enriched,
      resolved,
      options.propRules ?? DEFAULT_PROP_RULES,
      currency,
    ),
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
export * from './rng';
export * from './confidence';
export * from './baselines';
export * from './edgemap';
export * from './similar';
export * from './counterfactual';
export * from './replay';
export * from './dayStory';
export * from './prop';
export * from './wrapped';
