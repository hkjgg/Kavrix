import { describe, expect, it } from 'vitest';
import { getDemoLedger } from '@/lib/demo/ledger';
import { CSV_COLUMNS, csvField, ledgerCsv, ledgerCsvFilename, plainNumber } from './csv';
import { makeRow } from './fixtures';
import { DEFAULT_LEDGER_QUERY, applyLedgerQuery } from './query';

const parse = (csv: string): string[][] =>
  csv
    .trimEnd()
    .split('\r\n')
    .map((line) => line.split(','));

describe('ledgerCsv', () => {
  it('writes a real header row', () => {
    const [header] = parse(ledgerCsv([]));
    expect(header).toEqual(CSV_COLUMNS.map((column) => column.header));
    expect(header).toContain('Open time (UTC)');
    expect(header).toContain('Net P&L');
  });

  it('writes plain numbers: dot decimals, a hyphen for negatives, no symbols or separators', () => {
    const row = makeRow({
      id: 'T-1',
      positionId: 1,
      entryTicket: 10,
      exitTicket: 11,
      volume: 1.5,
      riskPercent: 1.23456,
      rMultiple: -2.5,
      netProfit: -12345.6,
      commission: -10.5,
      swap: 0,
      sessions: ['london', 'newYork'],
      impurities: ['revenge', 'news'],
      durationSeconds: 5_040,
      openTime: '2026-09-11T12:36:00.000Z',
      closeTime: '2026-09-11T14:00:00.000Z',
    });
    const [, line] = parse(ledgerCsv([row]));
    expect(line).toEqual([
      'T-1',
      '1',
      '10',
      '11',
      '2026-09-11T12:36:00.000Z',
      '2026-09-11T14:00:00.000Z',
      'Manual',
      '0',
      'XAUUSD',
      'buy',
      '1.50',
      '1.2346',
      '-2.5000',
      '-12345.60',
      '-10.50',
      '0.00',
      'London; New York',
      '5040',
      'Revenge; News window',
    ]);
    const csv = ledgerCsv([row]);
    expect(csv).not.toMatch(/[$€£−]/);
    expect(csv).not.toContain('12,345');
  });

  it('quotes a field that holds a comma or a quote', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "gold"')).toBe('"say ""gold"""');
    expect(csvField(null)).toBe('');
    expect(plainNumber(-0.0001, 2)).toBe('0.00');
  });

  it('exports exactly the current filtered, sorted rows — every page, in order', () => {
    const { rows, context } = getDemoLedger();
    const query = { ...DEFAULT_LEDGER_QUERY, source: 'manual', impurity: 'news' as const, sort: 'r' as const, dir: 'asc' as const, page: 2 };
    const shown = applyLedgerQuery(rows, query, { asOfMs: context.asOfMs });
    const lines = parse(ledgerCsv(shown));
    expect(lines).toHaveLength(shown.length + 1);
    expect(lines.slice(1).map((line) => line[0])).toEqual(shown.map((row) => row.id));
    for (const line of lines.slice(1)) {
      expect(line[6]).toBe('Manual');
      expect(line[18]).toContain('News window');
    }
    const r = lines.slice(1).map((line) => Number(line[12]));
    expect(r).toEqual([...r].sort((a, b) => a - b));
    for (const line of lines.slice(1)) expect(line[4]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
  });

  it('names the file after the period and the export instant, in UTC', () => {
    expect(ledgerCsvFilename('30d', Date.UTC(2026, 8, 23, 10, 15, 0))).toBe(
      'kavrix-ledger-30d-20260923T101500Z.csv',
    );
    expect(ledgerCsvFilename('90d', Date.UTC(2026, 0, 2, 3, 4, 5))).toBe(
      'kavrix-ledger-90d-20260102T030405Z.csv',
    );
  });
});
