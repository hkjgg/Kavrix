import { describe, expect, it } from 'vitest';
import { getDemoDossierSources } from '@/lib/demo/dossier';
import { GAP_PILLAR_LABELS, attributeCost } from '@/lib/engine/gap';
import { formatMoney, formatR } from '@/lib/format';
import { DEFAULT_LEDGER_QUERY, applyLedgerQuery } from '@/lib/ledger/query';
import { buildDossier, shortNewsLabel } from './dossier';

const sources = getDemoDossierSources();
const { assay } = sources;
const asOfMs = Date.parse(assay.asOf);

/** The engine's own default Similar Trades target: the window's costliest impurity. */
const target = assay.similar[0];
if (target === undefined) throw new Error('the engine computed no Similar Trades');
const trade = assay.trades.find((candidate) => candidate.id === target.tradeId);
if (trade === undefined) throw new Error('target trade missing');

const view = buildDossier(trade.id, sources, DEFAULT_LEDGER_QUERY);
if (view === null) throw new Error('no dossier');

describe('buildDossier — the trade', () => {
  it('returns nothing for a trade that does not exist', () => {
    expect(buildDossier('T-000000', sources, DEFAULT_LEDGER_QUERY)).toBeNull();
  });

  it('carries the trade’s own figures', () => {
    const r = view.figures.find((figure) => figure.label === 'R result');
    expect(r?.value).toBe(formatR(trade.rMultiple, { digits: 2 }));
    const pnl = view.figures.find((figure) => figure.label === 'Net P&L');
    expect(pnl?.value).toBe(formatMoney(trade.netProfit, { signed: true }));
    expect(view.badges.map((badge) => badge.label)).toHaveLength(trade.impurities.length);
  });
});

describe('buildDossier — impurities', () => {
  it('explains every flagged reason with a rule, a pillar and a billing line', () => {
    const kinds = view.impurities.map((impurity) => impurity.kind);
    for (const kind of trade.impurities) expect(kinds).toContain(kind);
    for (const impurity of view.impurities) {
      expect(impurity.rule).not.toBe('');
      expect(impurity.pillar).not.toBe('');
      expect(impurity.billing).not.toBe('');
    }
  });

  it('bills exactly one reason, the one the Karat Gap bills — for the same money', () => {
    const attribution = attributeCost(trade, assay.settings);
    if (attribution === null) throw new Error('the costliest impurity carries no cost');
    const billed = view.impurities.filter((impurity) => impurity.billed);
    expect(billed).toHaveLength(1);
    expect(billed[0]?.billing).toContain(GAP_PILLAR_LABELS[attribution.pillar]);
    expect(billed[0]?.cost).toBe(
      `${formatMoney(-attribution.costMoney, { signed: true })} · ${formatR(-attribution.costR)}`,
    );
    // And it is one of the Gap's own lines.
    expect(assay.gap.attributions).toContainEqual(attribution);
  });

  it('says why a reason was not billed', () => {
    for (const impurity of view.impurities.filter((entry) => !entry.billed)) {
      expect(impurity.billing).toMatch(/Not billed|No cost line|Billed nothing/);
    }
  });

  it('marks an EA trade as outside the score and the Gap', () => {
    const ea = assay.trades.find((candidate) => !candidate.isManual && candidate.impurities.length > 0);
    if (ea === undefined) throw new Error('no impure EA trade');
    const eaView = buildDossier(ea.id, sources, DEFAULT_LEDGER_QUERY);
    expect(eaView?.scopeNote).toContain('manual trading only');
    for (const impurity of eaView?.impurities ?? []) {
      expect(impurity.billed).toBe(false);
      expect(impurity.billing).toContain('EA trades are outside');
    }
  });

  it('shows a clean trade as clean', () => {
    const clean = assay.trades.find((candidate) => candidate.isManual && candidate.impurities.length === 0);
    if (clean === undefined) throw new Error('no clean trade');
    const cleanView = buildDossier(clean.id, sources, DEFAULT_LEDGER_QUERY);
    expect(cleanView?.impurities.filter((impurity) => impurity.kind !== 'overtradingDay')).toEqual([]);
    expect(cleanView?.badges).toEqual([]);
  });
});

describe('buildDossier — similar trades', () => {
  it('is the engine’s own k-nearest-neighbour result for this trade', () => {
    expect(view.similar.headline).toBe(target.headline);
    expect(view.similar.neighbours.map((neighbour) => neighbour.id)).toEqual(
      target.neighbours.map((neighbour) => neighbour.tradeId),
    );
    expect(view.similar.neighbours).toHaveLength(assay.settings.similarNeighbours);
  });

  it('states — and checks — that every neighbour closed before this trade opened', () => {
    expect(view.similar.allClosedBefore).toBe(true);
    expect(view.similar.hindsightLine).toContain(`All ${assay.settings.similarNeighbours} closed before this trade opened`);
    for (const neighbour of target.neighbours) {
      const other = assay.trades.find((candidate) => candidate.id === neighbour.tradeId);
      expect(other?.closeTimeMs).toBeLessThan(trade.openTimeMs);
    }
  });

  it('carries the §6.6 confidence', () => {
    expect(view.similar.confidence?.label).toMatch(/Strong|Moderate|Weak/);
    expect(view.similar.confidence?.sample).toContain(`n = ${target.confidence.n}`);
  });
});

describe('buildDossier — chart', () => {
  it('draws candles around the trade, with the entry and exit on candles', () => {
    const chart = view.chart;
    if (chart === null) throw new Error('no chart');
    const times = new Set(chart.candles.map((candle) => candle.time));
    expect(chart.candles.length).toBeGreaterThan(20);
    expect(times.has(chart.entry.time)).toBe(true);
    expect(times.has(chart.exit.time)).toBe(true);
    expect(chart.entry.price).toBe(trade.openPrice);
    expect(chart.initialSl).toBe(trade.initialSl);
  });

  it('puts every high-impact USD release in view on the time axis, on a candle', () => {
    const chart = view.chart;
    if (chart === null) throw new Error('no chart');
    const times = new Set(chart.candles.map((candle) => candle.time));
    for (const event of chart.news) expect(times.has(event.time)).toBe(true);
    // The trade was taken into a release: at least that one is in view.
    if (trade.inNewsWindow) expect(chart.news.length).toBeGreaterThan(0);
  });

  it('marks the MFE and MAE and says the chart in words', () => {
    const chart = view.chart;
    if (chart === null) throw new Error('no chart');
    expect(chart.mfe.label).toBe(`MFE ${formatR(trade.mfeR)}`);
    expect(chart.mae.label).toBe(`MAE ${formatR(trade.maeR)}`);
    expect(chart.summary).toContain('candles');
  });

  it('draws every stop modification of a trade whose stop was widened', () => {
    const widened = assay.trades.find((candidate) => candidate.slWidened);
    if (widened === undefined) throw new Error('no widened stop');
    const widenedView = buildDossier(widened.id, sources, DEFAULT_LEDGER_QUERY);
    const moves = sources.modifications.filter((modification) => modification.positionId === widened.positionId);
    expect(widenedView?.chart?.slMoves.length).toBe(moves.length);
  });

  it('shortens release names for the axis', () => {
    expect(shortNewsLabel('Non-Farm Payrolls')).toBe('NFP');
    expect(shortNewsLabel('FOMC Rate Decision')).toBe('FOMC');
  });
});

describe('buildDossier — previous and next follow the Ledger’s filter', () => {
  it('walks the filtered, sorted rows and carries the filter in every link', () => {
    const query = { ...DEFAULT_LEDGER_QUERY, source: 'manual', sort: 'r' as const, dir: 'asc' as const };
    const ordered = applyLedgerQuery(sources.rows, query, { asOfMs });
    const index = ordered.findIndex((row) => row.id === trade.id);
    const filtered = buildDossier(trade.id, sources, query);
    expect(filtered?.nav.previous?.label).toBe(ordered[index - 1]?.id);
    expect(filtered?.nav.next?.label).toBe(ordered[index + 1]?.id);
    expect(filtered?.nav.next?.href).toContain('source=manual&sort=r&dir=asc');
    expect(filtered?.nav.position).toBe(`Trade ${index + 1} of ${ordered.length} in the current filter`);
    expect(filtered?.nav.back).toContain('/ledger?source=manual&sort=r&dir=asc');
    const page = Math.floor(index / 50) + 1;
    if (page > 1) expect(filtered?.nav.back).toContain(`page=${page}`);
  });

  it('falls back to the whole Ledger when the trade is outside the filter, and says so', () => {
    const query = { ...DEFAULT_LEDGER_QUERY, result: trade.isLoss ? ('win' as const) : ('loss' as const) };
    const outside = buildDossier(trade.id, sources, query);
    expect(outside?.nav.note).toContain('outside the filter');
    expect(outside?.nav.position).toContain('in the Ledger');
  });
});
