/**
 * Export CSV (Stage 4) — exactly the rows the Ledger shows, in its order.
 *
 * Generated in the browser from the same rows the table draws, so what is
 * exported is what is on screen, every page of it. The file is for a
 * spreadsheet, not a person: RFC 4180 quoting, CRLF line ends, UTC ISO times,
 * plain numbers with a dot decimal — no currency symbols, no thousands
 * separators, a hyphen-minus rather than the typographic minus the screen uses.
 */

import { IMPURITY_LABELS, SESSION_LABELS } from './labels';
import type { LedgerPeriod } from './query';
import type { LedgerRow } from './types';

interface Column {
  header: string;
  value: (row: LedgerRow) => string | number | null;
}

/** A number at fixed decimals, never `-0`, never exponent notation. */
export function plainNumber(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '';
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

export const CSV_COLUMNS: readonly Column[] = [
  { header: 'Trade ID', value: (row) => row.id },
  { header: 'Position ID', value: (row) => row.positionId },
  { header: 'Entry ticket', value: (row) => row.entryTicket },
  { header: 'Exit ticket', value: (row) => row.exitTicket },
  { header: 'Open time (UTC)', value: (row) => row.openTime },
  { header: 'Close time (UTC)', value: (row) => row.closeTime },
  { header: 'Source', value: (row) => row.source },
  { header: 'Magic', value: (row) => row.magic },
  { header: 'Symbol', value: (row) => row.symbol },
  { header: 'Direction', value: (row) => row.direction },
  { header: 'Volume (lots)', value: (row) => plainNumber(row.volume, 2) },
  { header: 'Risk %', value: (row) => plainNumber(row.riskPercent, 4) },
  { header: 'R multiple', value: (row) => plainNumber(row.rMultiple, 4) },
  { header: 'Net P&L', value: (row) => plainNumber(row.netProfit, 2) },
  { header: 'Commission', value: (row) => plainNumber(row.commission, 2) },
  { header: 'Swap', value: (row) => plainNumber(row.swap, 2) },
  {
    header: 'Sessions',
    value: (row) => row.sessions.map((session) => SESSION_LABELS[session]).join('; '),
  },
  { header: 'Duration (seconds)', value: (row) => row.durationSeconds },
  {
    header: 'Impurities',
    value: (row) => row.impurities.map((kind) => IMPURITY_LABELS[kind]).join('; '),
  },
];

/** RFC 4180: quote a field holding a comma, a quote or a line break; double the quotes. */
export function csvField(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ledgerCsv(rows: readonly LedgerRow[]): string {
  const lines = [CSV_COLUMNS.map((column) => csvField(column.header)).join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvField(column.value(row))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** `kavrix-ledger-30d-20260923T101500Z.csv` — the period, and when it was exported (UTC). */
export function ledgerCsvFilename(period: LedgerPeriod, exportedAtMs: number): string {
  const stamp = new Date(exportedAtMs).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `kavrix-ledger-${period}-${stamp}.csv`;
}
