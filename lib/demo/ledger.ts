/**
 * The demo account's Ledger rows, built once from the memoised Assay.
 *
 * The rows are the engine's own trades with the deal tickets joined back on
 * from the generated deals, so the ticket search finds what a trader would
 * type from MT5. Everything else on a row is an `EnrichedTrade` field.
 */

import { buildLedgerRows } from '@/lib/ledger/rows';
import type { LedgerRow } from '@/lib/ledger/types';
import { getDemoAssay, getDemoDataset } from './assay';

export interface LedgerSourceOption {
  /** `manual` or the magic number. */
  value: string;
  label: string;
}

export interface LedgerContext {
  /** The engine's "now". Periods end here. */
  asOfMs: number;
  currency: string;
  riskLimitPercent: number;
  rollingWindowDays: number;
  sources: LedgerSourceOption[];
  /** Whether any trade opened outside every session — the filter offers it only then. */
  hasOffSession: boolean;
}

let cached: { rows: LedgerRow[]; context: LedgerContext } | null = null;

export function getDemoLedger(): { rows: LedgerRow[]; context: LedgerContext } {
  if (cached !== null) return cached;

  const assay = getDemoAssay();
  const data = getDemoDataset();
  const eaNames = new Map(assay.constellation.eas.map((ea) => [ea.magic, ea.name]));
  for (const ea of data.eas) if (!eaNames.has(ea.magic)) eaNames.set(ea.magic, ea.name);
  const tickets = new Map(
    data.trades.map((trade) => [
      trade.id,
      { entry: trade.entryDealTicket, exit: trade.exitDealTicket },
    ]),
  );

  const rows = buildLedgerRows(assay.trades, { settings: assay.settings, eaNames, tickets });
  const magics = [...new Set(rows.filter((row) => row.magic !== 0).map((row) => row.magic))].sort(
    (a, b) => a - b,
  );

  cached = {
    rows,
    context: {
      asOfMs: Date.parse(assay.asOf),
      currency: assay.account.currency,
      riskLimitPercent: assay.settings.riskLimitPercent,
      rollingWindowDays: assay.settings.rollingWindowDays,
      sources: [
        { value: 'manual', label: 'Manual' },
        ...magics.map((magic) => ({
          value: String(magic),
          label: `${eaNames.get(magic) ?? 'EA'} · ${magic}`,
        })),
      ],
      hasOffSession: rows.some((row) => row.sessions.length === 0),
    },
  };
  return cached;
}
