/**
 * Engine settings — every threshold CLAUDE.md §5–§7 leaves configurable,
 * in one place, with the documented defaults.
 *
 * The engine never reads a constant out of thin air: if a number decides
 * whether a trade is an impurity, it lives here and Settings can change it
 * (CLAUDE.md §6.1). Defaults are the values in the spec.
 */

export interface EngineSettings {
  /* — Risk (§6.1) — */
  /** Risk limit as a percentage of equity at entry. A trade at or under this scores 1. */
  riskLimitPercent: number;
  /** Multiple of the limit at which the risk score reaches 0. */
  riskZeroMultiple: number;
  /**
   * Risk assumed for a trade opened without a stop, as a percentage of equity
   * (§5). It is the R denominator only — the Risk pillar still scores such a
   * trade 0.
   */
  defaultRiskPercent: number;

  /* — Revenge (§6.1) — */
  /** A trade opened within this many minutes of a losing close is revenge. */
  revengeWindowMinutes: number;
  /** Lot multiple over the previous trade that counts as revenge after a loss. */
  revengeLotMultiple: number;

  /* — Stops (§6.1) — */
  /** A stop must be on the position within this many seconds of entry. */
  stopSetWithinSeconds: number;
  /** Price tolerance when deciding whether a stop was moved further from entry. */
  stopMoveEpsilon: number;

  /* — Exits (§6.1) — */
  /** A loss worse than this (in R) is an overrun. Negative. */
  exitOverrunR: number;
  /** Share of the Exits pillar given to the overrun ratio; the rest goes to asymmetry. */
  exitOverrunWeight: number;

  /* — Overtrading (§6.1) — */
  /** More trades than this in one UTC day makes the day a violation. */
  dailyMaxTrades: number;

  /* — Market conditions (§5, §6.1) — */
  /** Minutes either side of a high-impact USD release that count as a news window. */
  newsWindowMinutes: number;
  /** Minutes either side of broker midnight that count as rollover. */
  rolloverWindowMinutes: number;
  /** Broker server clock offset from UTC, in hours. */
  serverUtcOffsetHours: number;
  /** A trade whose comment contains this tag is exempt from the news window (§6.1). */
  newsStrategyTag: string;

  /* — Scoring window (§6.1) — */
  /** Recency half-life in days. */
  recencyHalfLifeDays: number;
  /** Length of the rolling window the score is computed over, in days. */
  rollingWindowDays: number;
  /** Fewer manual trades than this in the window → "Assaying…", no score. */
  minimumTrades: number;

  /* — Your Proof (§6.4) — */
  /** Weeks with fewer trades than this are ignored by Proof. */
  proofMinTradesPerWeek: number;
  /** Karat at or above this puts a week in the disciplined bucket. */
  proofHighKarat: number;
  /** Karat below this puts a week in the impure bucket. */
  proofLowKarat: number;
  /** Each bucket needs at least this many weeks or the card stays hidden. */
  proofMinWeeksPerBucket: number;

  /* — EA health (§7) — */
  /** Trades used as the live baseline when the user entered no backtest expectancy. */
  eaBaselineTradeCount: number;
  /** Trades in the "recent" expectancy window used for drift. */
  eaRecentTradeCount: number;
  /** Standard errors below baseline that raise a drift alert. */
  eaDriftStandardErrors: number;
  /** Trades per block when measuring EA consistency. */
  eaConsistencyBlockTrades: number;
  /** Daily P&L correlation at or above this flags two EAs as the same bet. */
  eaSameBetCorrelation: number;
  /** Days both EAs must have traded before their correlation is reported at all. */
  eaMinOverlapDays: number;
  /** Simulated paths in the Monte Carlo drawdown band. */
  eaDrawdownPaths: number;
  /** Floor the path count tapers to for an EA with a very long history. */
  eaDrawdownMinPaths: number;
  /** Simulated trades one band may draw in total (`paths × trades`). */
  eaDrawdownSampleBudget: number;

  /* — Confidence (§6.6) — */
  /** Resamples in the bootstrap behind every confidence interval. */
  bootstrapResamples: number;
  /** Floor the resample count tapers to on a very large group. */
  bootstrapMinResamples: number;
  /** Observations one group may resample in total (`resamples × n`). */
  bootstrapSampleBudget: number;
  /** Trades needed before a 95%-interval claim may be called Strong. */
  confidenceStrongMinTrades: number;
  /** Trades needed before an 80%-interval claim may be called Moderate. */
  confidenceModerateMinTrades: number;

  /* — Personal baselines (§6.7) — */
  /** Days of behaviour compared against the trader's own baseline. */
  baselineRecentDays: number;
  /** Trades the baseline needs before "outside your normal" may be claimed. */
  baselineMinTrades: number;

  /* — Edge Map (§6.8) — */
  /** Cells with fewer trades than this are not tested at all. */
  edgeMapMinCellTrades: number;
  /** False-discovery rate the Benjamini–Hochberg correction controls. */
  edgeMapAlpha: number;
  /** Strengths and weaknesses reported from the map. */
  edgeMapTopCells: number;

  /* — Similar Trades (§6.9) — */
  /** Nearest neighbours returned. */
  similarNeighbours: number;
  /** Prior trades the entry-volatility feature is measured over. */
  similarVolatilityLookback: number;

  /* — Discipline Replay (§6.11) — */
  /** Impurities this close together form a tilt episode. */
  tiltWindowMinutes: number;
  /** Impurities needed before a run counts as a tilt episode. */
  tiltMinImpurities: number;
}

/** The shipped defaults, exactly as CLAUDE.md §5–§7 states them. */
export const DEFAULT_SETTINGS: EngineSettings = {
  riskLimitPercent: 1,
  riskZeroMultiple: 1.5,
  defaultRiskPercent: 1,

  revengeWindowMinutes: 15,
  revengeLotMultiple: 1.25,

  stopSetWithinSeconds: 60,
  stopMoveEpsilon: 0.005,

  exitOverrunR: -1.1,
  exitOverrunWeight: 0.7,

  dailyMaxTrades: 5,

  newsWindowMinutes: 15,
  rolloverWindowMinutes: 15,
  serverUtcOffsetHours: 0,
  newsStrategyTag: 'news-strategy',

  recencyHalfLifeDays: 10,
  rollingWindowDays: 30,
  minimumTrades: 10,

  proofMinTradesPerWeek: 5,
  proofHighKarat: 20,
  proofLowKarat: 14,
  proofMinWeeksPerBucket: 3,

  eaBaselineTradeCount: 50,
  eaRecentTradeCount: 20,
  eaDriftStandardErrors: 2,
  eaConsistencyBlockTrades: 20,
  eaSameBetCorrelation: 0.6,
  eaMinOverlapDays: 10,
  eaDrawdownPaths: 2_000,
  eaDrawdownMinPaths: 200,
  eaDrawdownSampleBudget: 1_000_000,

  bootstrapResamples: 2_000,
  bootstrapMinResamples: 200,
  bootstrapSampleBudget: 400_000,
  confidenceStrongMinTrades: 20,
  confidenceModerateMinTrades: 10,

  baselineRecentDays: 7,
  baselineMinTrades: 20,

  edgeMapMinCellTrades: 8,
  edgeMapAlpha: 0.05,
  edgeMapTopCells: 3,

  similarNeighbours: 12,
  similarVolatilityLookback: 20,

  tiltWindowMinutes: 60,
  tiltMinImpurities: 2,
};

/** Fills a partial settings object with the defaults. */
export function resolveSettings(
  overrides: Partial<EngineSettings> = {},
): EngineSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}
