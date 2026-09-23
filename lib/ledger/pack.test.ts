import { describe, expect, it } from 'vitest';
import { getDemoLedger } from '@/lib/demo/ledger';
import { makeRow } from './fixtures';
import { packLedgerRows, unpackLedgerRows } from './pack';

describe('packLedgerRows', () => {
  it('round-trips every demo row losslessly', () => {
    const { rows } = getDemoLedger();
    expect(unpackLedgerRows(packLedgerRows(rows))).toEqual(rows);
  });

  it('survives JSON, which is how it reaches the browser', () => {
    const { rows } = getDemoLedger();
    const wire = JSON.parse(JSON.stringify(packLedgerRows(rows)));
    expect(unpackLedgerRows(wire)).toEqual(rows);
  });

  it('keeps the edge cases: no tickets, no release, off-session, every impurity in order', () => {
    const row = makeRow({
      entryTicket: null,
      exitTicket: null,
      newsMinutes: null,
      sessions: [],
      direction: 'sell',
      netProfit: 0,
      rMultiple: 0,
      isWin: false,
      isLoss: false,
      impurities: ['revenge', 'news', 'rollover', 'oversized', 'noStop', 'stopWidened', 'exitOverrun'],
      news: 'near',
      stop: 'none',
    });
    expect(unpackLedgerRows(packLedgerRows([row]))).toEqual([row]);
  });

  it('is much smaller than the rows it packs', () => {
    const { rows } = getDemoLedger();
    const packed = JSON.stringify(packLedgerRows(rows)).length;
    expect(packed).toBeLessThan(JSON.stringify(rows).length / 2);
  });
});
