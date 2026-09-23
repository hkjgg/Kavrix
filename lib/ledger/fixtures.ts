/**
 * Hand-built Ledger rows for the Ledger's tests. No assertions, no logic —
 * just rows whose every field is visible at the call site.
 */

import type { LedgerRow } from './types';

/** 2026-09-20T00:00Z — the demo's "now", and the fixtures'. */
export const FIXTURE_AS_OF_MS = Date.UTC(2026, 8, 20);
const DAY_MS = 86_400_000;

let sequence = 0;

export function makeRow(overrides: Partial<LedgerRow> & { daysAgo?: number } = {}): LedgerRow {
  sequence += 1;
  const { daysAgo = 1, ...rest } = overrides;
  const openTimeMs = rest.openTimeMs ?? FIXTURE_AS_OF_MS - daysAgo * DAY_MS;
  const rMultiple = rest.rMultiple ?? 1;
  const netProfit = rest.netProfit ?? rMultiple * 100;
  return {
    id: `T-${800000 + sequence}`,
    positionId: 800000 + sequence,
    entryTicket: 900000 + sequence * 2,
    exitTicket: 900001 + sequence * 2,
    magic: 0,
    source: 'Manual',
    symbol: 'XAUUSD',
    direction: 'buy',
    volume: 0.1,
    openTime: new Date(openTimeMs).toISOString(),
    closeTime: new Date(openTimeMs + 30 * 60_000).toISOString(),
    openTimeMs,
    riskPercent: 1,
    rMultiple,
    netProfit,
    commission: -0.7,
    swap: 0,
    sessions: ['london'],
    durationSeconds: 1_800,
    impurities: [],
    isWin: netProfit > 0,
    isLoss: netProfit < 0,
    news: 'clear',
    newsMinutes: 120,
    stop: 'compliant',
    ...rest,
  };
}
