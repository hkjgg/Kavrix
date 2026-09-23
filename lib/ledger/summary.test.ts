import { describe, expect, it } from 'vitest';
import { getDemoAssay } from '@/lib/demo/assay';
import { getDemoLedger } from '@/lib/demo/ledger';
import { makeRow } from './fixtures';
import { DEFAULT_LEDGER_QUERY, applyLedgerQuery } from './query';
import { summarizeRows } from './summary';

describe('summarizeRows', () => {
  it('adds up the rows it is given, by hand', () => {
    const rows = [
      makeRow({ rMultiple: 2, netProfit: 200, riskPercent: 1 }),
      makeRow({ rMultiple: -1, netProfit: -100, riskPercent: 1.5 }),
      makeRow({ rMultiple: 0, netProfit: 0, riskPercent: 0.5 }),
      makeRow({ rMultiple: 0.5, netProfit: 50, riskPercent: 1 }),
    ];
    expect(summarizeRows(rows)).toEqual({
      trades: 4,
      wins: 2,
      losses: 1,
      winRate: 50,
      netR: 1.5,
      netMoney: 150,
      averageRiskPercent: 1,
    });
  });

  it('reports nothing rather than zero for an empty filter', () => {
    expect(summarizeRows([])).toEqual({
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      netR: 0,
      netMoney: 0,
      averageRiskPercent: null,
    });
  });

  it('never reports −0', () => {
    const summary = summarizeRows([makeRow({ rMultiple: -0.00001, netProfit: -0.001 })]);
    expect(Object.is(summary.netR, -0)).toBe(false);
    expect(Object.is(summary.netMoney, -0)).toBe(false);
  });
});

describe('the summary strip recomputes under the current filter', () => {
  const { rows, context } = getDemoLedger();
  const assay = getDemoAssay();
  const view = (overrides: Partial<typeof DEFAULT_LEDGER_QUERY>) =>
    summarizeRows(applyLedgerQuery(rows, { ...DEFAULT_LEDGER_QUERY, ...overrides }, { asOfMs: context.asOfMs }));
  const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

  it('covers every trade with no filter', () => {
    const all = view({});
    expect(all.trades).toBe(assay.counts.trades);
    expect(all.netMoney).toBeCloseTo(sum(assay.trades.map((trade) => trade.netProfit)), 2);
  });

  it('matches the engine’s manual trades under the manual filter', () => {
    const manual = assay.trades.filter((trade) => trade.isManual);
    const summary = view({ source: 'manual' });
    expect(summary.trades).toBe(assay.counts.manualTrades);
    expect(summary.netR).toBeCloseTo(sum(manual.map((trade) => trade.rMultiple)), 3);
    expect(summary.netMoney).toBeCloseTo(sum(manual.map((trade) => trade.netProfit)), 2);
    expect(summary.wins).toBe(manual.filter((trade) => trade.isWin).length);
  });

  it('matches the Karat window under the 30-day manual filter', () => {
    expect(view({ period: '30d', source: 'manual' }).trades).toBe(assay.karat.tradeCount);
  });

  it('moves with every filter, and the parts add up to the whole', () => {
    const wins = view({ result: 'win' });
    const losses = view({ result: 'loss' });
    const all = view({});
    expect(wins.trades + losses.trades).toBeLessThanOrEqual(all.trades);
    expect(wins.netMoney + losses.netMoney).toBeCloseTo(all.netMoney, 2);
    expect(wins.winRate).toBe(100);
    expect(losses.winRate).toBe(0);
    const clean = view({ impurity: 'clean' });
    const impure = view({ impurity: 'any' });
    expect(clean.trades + impure.trades).toBe(all.trades);
  });
});
