/**
 * The summary strip above the Ledger — "current filter" (Stage 4).
 *
 * Counts, sums and one mean over rows the engine already measured. It adds no
 * new metric: a trade's R, P&L and risk % are the engine's, and this only
 * says what the rows on screen add up to. Browser-safe and pure, so the strip
 * recomputes on every filter change without a round trip.
 */

import type { LedgerRow } from './types';

export interface LedgerSummary {
  trades: number;
  wins: number;
  losses: number;
  /** Wins ÷ trades, in percent — a scratch trade counts as neither. `null` with no trades. */
  winRate: number | null;
  netR: number;
  netMoney: number;
  /** Mean risk % per trade. `null` with no trades. */
  averageRiskPercent: number | null;
}

/** Rounded to a fixed number of decimals, without `−0`. */
function fixed(value: number, digits: number): number {
  const rounded = Number(value.toFixed(digits));
  return rounded === 0 ? 0 : rounded;
}

export function summarizeRows(rows: readonly LedgerRow[]): LedgerSummary {
  let wins = 0;
  let losses = 0;
  let netR = 0;
  let netMoney = 0;
  let risk = 0;
  for (const row of rows) {
    if (row.isWin) wins += 1;
    if (row.isLoss) losses += 1;
    netR += row.rMultiple;
    netMoney += row.netProfit;
    risk += row.riskPercent;
  }
  const trades = rows.length;
  return {
    trades,
    wins,
    losses,
    winRate: trades === 0 ? null : fixed((wins / trades) * 100, 4),
    netR: fixed(netR, 4),
    netMoney: fixed(netMoney, 2),
    averageRiskPercent: trades === 0 ? null : fixed(risk / trades, 4),
  };
}
