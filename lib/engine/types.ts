/**
 * Kavrix domain types.
 *
 * These are the shapes the whole product speaks. They mirror the ingest
 * payload in CLAUDE.md §12 exactly, so demo data and real MT5 data are the
 * same thing as far as the engine and the UI are concerned — the only
 * difference is where they came from.
 *
 * Nothing in here is a metric. Karat, R-multiples, risk%, sessions and
 * Fineness are all derived later by the engine (CLAUDE.md §5–§7); a `Trade`
 * is nothing more than a position's deals added up.
 */

/** MT5 deal direction. */
export type DealType = 'buy' | 'sell';

/** MT5 deal role: `in` opens a position, `out` closes it. */
export type DealEntry = 'in' | 'out';

/** Impact flag from the MT5 economic calendar. Only `high` drives §5 news windows. */
export type NewsImportance = 'low' | 'medium' | 'high';

/** Direction of a closed position. */
export type TradeDirection = 'buy' | 'sell';

/**
 * A single MT5 deal, exactly as the Kavrix Connector sends it.
 *
 * Money fields are in the account currency. `commission` and `swap` are
 * signed the way MT5 signs them: costs are negative.
 */
export interface Deal {
  /** MT5 deal ticket. Unique per account — ingest is idempotent on this. */
  ticket: number;
  /** Position this deal belongs to. The `in` and `out` deals share it. */
  positionId: number;
  /** Execution time, ISO 8601 with a `Z` suffix. */
  time: string;
  type: DealType;
  entry: DealEntry;
  symbol: string;
  /** Lots. */
  volume: number;
  /** Execution price. */
  price: number;
  /** Stop loss attached to the position at this deal, `0` when none. */
  sl: number;
  /** Take profit attached to the position at this deal, `0` when none. */
  tp: number;
  /** Gross profit of the deal, before commission and swap. `0` on an `in` deal. */
  profit: number;
  commission: number;
  swap: number;
  /** Expert Advisor magic number. `0` means the trade was placed by hand. */
  magic: number;
  comment: string;
  /** Spread at execution, in points. */
  spreadPoints: number;
}

/** An SL/TP change made after the position was opened. */
export interface SlModification {
  positionId: number;
  /** ISO 8601 with a `Z` suffix. */
  time: string;
  /** New stop loss, `0` when the stop was removed. */
  sl: number;
  /** New take profit, `0` when none. */
  tp: number;
}

/** A high-impact economic release from the MT5 built-in calendar. */
export interface NewsEvent {
  /** MT5 calendar event id — ingest is idempotent on this. */
  eventId: number;
  /** Release time, ISO 8601 with a `Z` suffix. */
  time: string;
  /** ISO 4217 currency the event belongs to, e.g. `USD`. */
  currency: string;
  importance: NewsImportance;
  name: string;
}

/** Per-symbol contract facts, read from the broker — never hardcoded (CLAUDE.md §5). */
export interface SymbolInfo {
  /** Units per 1.00 lot. XAUUSD is 100 oz. */
  contractSize: number;
  /** Price decimals. XAUUSD is 2, so one point is 0.01. */
  digits: number;
}

/** The trading account the deals belong to. */
export interface Account {
  login: number;
  server: string;
  /** ISO 4217 account currency. */
  currency: string;
  balance: number;
  equity: number;
  leverage: number;
}

/** An Expert Advisor, grouped by magic number (CLAUDE.md §7). */
export interface Ea {
  /** MT5 magic number. Identity of the EA. */
  magic: number;
  name: string;
  /**
   * Backtest expectancy in R, entered by the user. `null` means Fineness
   * falls back to the EA's first 50 live trades.
   */
  baselineExpectancyR: number | null;
  /**
   * Backtest dispersion — the standard deviation of R per trade — entered
   * with the expectancy. With both, EA Health draws a Monte Carlo drawdown
   * band from the backtest (§7). Absent or `null`, it falls back to the
   * baseline period's drawdown.
   */
  baselineStdDevR?: number | null;
}

/**
 * A closed position: its `in` and `out` deals added up (CLAUDE.md §5).
 *
 * Purely structural. `initialSl` is the stop that was on the position at
 * entry, not a judgement about it; `mfePrice` / `maePrice` are prices, and
 * the engine is what turns them into R.
 */
export interface Trade {
  /** Stable id, derived from the position. */
  id: string;
  positionId: number;
  symbol: string;
  /** `0` for a manual trade, otherwise the EA's magic number. */
  magic: number;
  comment: string;
  direction: TradeDirection;
  /** Lots. */
  volume: number;
  /** ISO 8601 with a `Z` suffix. */
  openTime: string;
  /** ISO 8601 with a `Z` suffix. */
  closeTime: string;
  openPrice: number;
  closePrice: number;
  /** SL on the position at entry, `null` when it was opened without one. */
  initialSl: number | null;
  /** TP on the position at entry, `null` when none. */
  initialTp: number | null;
  /** SL on the position when it closed, `null` when none. */
  finalSl: number | null;
  /** TP on the position when it closed, `null` when none. */
  finalTp: number | null;
  /** Gross P&L, before costs. */
  grossProfit: number;
  /** Negative: what the round turn cost. */
  commission: number;
  /** Signed swap accumulated over the nights the position was held. */
  swap: number;
  /** `grossProfit + commission + swap`. A loss is `netProfit < 0` (CLAUDE.md §5). */
  netProfit: number;
  /** Best price reached in the trade's favour while it was open. */
  mfePrice: number;
  /** Worst price reached against the trade while it was open. */
  maePrice: number;
  spreadPointsAtEntry: number;
  spreadPointsAtExit: number;
  /** Account equity at the moment of entry — the denominator for risk% (§6.1). */
  equityAtEntry: number;
  /** Units per lot for this symbol at the time of the trade. */
  contractSize: number;
  durationSeconds: number;
  entryDealTicket: number;
  exitDealTicket: number;
}

/** The body of `POST /api/ingest` (CLAUDE.md §12). */
export interface IngestPayload {
  account: Account;
  deals: Deal[];
  modifications: SlModification[];
  calendar: NewsEvent[];
  symbolInfo: Record<string, SymbolInfo>;
}
