/**
 * The Constellation view (Stage 6) against the engine: every figure the page
 * prints is read out of `runEngine`'s own `constellation`, and every sentence
 * quotes it. Expected values come from the engine, never written in.
 */

import { describe, expect, it } from 'vitest';
import { getDemoAssay } from '@/lib/demo/assay';
import { getDemoConstellation } from '@/lib/demo/constellation';
import type { EaResult } from '@/lib/engine/ea';
import { formatR } from '@/lib/format';
import {
  SAME_BET_SENTENCE,
  bandSentence,
  buildConstellationView,
  correlationText,
  driftSentence,
  finenessText,
} from './constellation';

const assay = getDemoAssay();
const view = getDemoConstellation();
const eas = new Map(assay.constellation.eas.map((ea) => [ea.magic, ea]));

function ea(magic: number): EaResult {
  const found = eas.get(magic);
  if (found === undefined) throw new Error(`no EA ${magic}`);
  return found;
}

describe('the summary row', () => {
  it('reads the engine’s summary', () => {
    const { summary } = assay.constellation;
    expect(view.summary.map((item) => item.label)).toEqual(['EAs', 'Average Fineness', 'Same-bet pairs', 'Drifting']);
    expect(view.summary[0]?.value).toBe(String(summary.eaCount));
    expect(view.summary[1]?.value).toBe(`${summary.averageFineness?.toFixed(1)}‰`);
    expect(view.summary[2]?.value).toBe('1');
    expect(view.summary[2]?.note).toBe('Gold Scalper · London Breakout');
    expect(view.summary[3]?.value).toBe('1');
    expect(view.summary[3]?.note).toBe('Grid Recovery');
  });
});

describe('the stars', () => {
  it('are the EAs: brightness from the label, a ring where they drift', () => {
    expect(view.stars.map((star) => star.magic)).toEqual([1001, 1002, 1003]);
    const byMagic = new Map(view.stars.map((star) => [star.magic, star]));
    expect(byMagic.get(1001)?.tone).toBe('fine');
    expect(byMagic.get(1002)?.tone).toBe('fine');
    expect(byMagic.get(1003)?.tone).toBe('degraded');
    expect(byMagic.get(1003)?.drifting).toBe(true);
    expect(byMagic.get(1001)?.drifting).toBe(false);
    expect(byMagic.get(1003)?.finenessText).toBe(finenessText(ea(1003).fineness));
    expect(byMagic.get(1001)?.netR).toBe(formatR(ea(1001).netR));
  });

  it('size by volume: the EA that traded most is the largest', () => {
    const largest = [...assay.constellation.eas].sort((a, b) => b.volumeLots - a.volumeLots)[0];
    const biggest = [...view.stars].sort((a, b) => b.r - a.r)[0];
    expect(biggest?.magic).toBe(largest?.magic);
  });

  it('name every figure the tooltip shows', () => {
    const star = view.stars.find((candidate) => candidate.magic === 1001);
    expect(star?.ariaLabel).toContain('Gold Scalper, magic 1001.');
    expect(star?.ariaLabel).toContain(`Fineness ${finenessText(ea(1001).fineness)}, Fine.`);
    expect(star?.ariaLabel).toContain('Same bet as London Breakout.');
    expect(view.stars.find((candidate) => candidate.magic === 1003)?.ariaLabel).toContain('Drifting.');
  });

  it('keep their entrance inside about a second', () => {
    for (const star of view.stars) expect(star.delay).toBeLessThanOrEqual(600);
  });
});

describe('the threads', () => {
  it('join only the positively correlated pair, doubled for the same bet', () => {
    expect(view.threads).toHaveLength(1);
    const thread = view.threads[0];
    expect([thread?.a, thread?.b]).toEqual([1001, 1002]);
    expect(thread?.sameBet).toBe(true);
    expect(thread?.lines).toHaveLength(2);
    expect(thread?.opacity).toBe(0.84);
    expect(thread?.correlationText).toBe('0.84');
  });
});

describe('the EA panel', () => {
  it('heads with the Fineness struck as ‰, the label and the figures', () => {
    const panel = view.panels['1003'];
    expect(panel?.finenessText).toBe(`${ea(1003).fineness?.toFixed(1)}‰`);
    expect(panel?.labelText).toBe('Degraded');
    expect(panel?.figures.map((figure) => figure.label)).toEqual(['Net R', 'Profit factor', 'Max drawdown', 'Expectancy']);
    expect(panel?.figures[0]?.value).toBe(formatR(ea(1003).netR));
    expect(panel?.figures[1]?.value).toBe(ea(1003).profitFactor?.toFixed(2));
    expect(panel?.figures[2]?.value).toBe(formatR(-ea(1003).maxDrawdownR));
    expect(panel?.ledgerHref).toBe('/ledger?source=1003');
  });

  it('breaks the Fineness into the four weighted components, in §7 order', () => {
    const panel = view.panels['1001'];
    expect(panel?.components.map((component) => [component.label, component.weightText])).toEqual([
      ['Expectancy stability', '40%'],
      ['Drawdown vs baseline', '30%'],
      ['Consistency', '20%'],
      ['Execution quality', '10%'],
    ]);
    expect(panel?.components[2]?.value).toBe(ea(1001).components.consistency);
    for (const component of panel?.components ?? []) expect(component.note.length).toBeGreaterThan(20);
  });

  it('explains the drift alert with the engine’s numbers', () => {
    const drift = ea(1003).drift;
    const sentence = view.panels['1003']?.drift.sentence ?? '';
    expect(view.panels['1003']?.drift.alert).toBe(true);
    expect(sentence).toContain(formatR(drift.recentExpectancyR, { digits: 2 }));
    expect(sentence).toContain(formatR(drift.baselineExpectancyR, { digits: 2 }));
    expect(sentence).toContain(`${drift.standardErrors.toFixed(2)} standard errors below it, past the drift line`);
    expect(sentence).toContain(formatR(drift.thresholdR, { digits: 2 }));
    expect(view.panels['1003']?.drift.chart?.last?.below).toBe(true);
  });

  it('says a healthy EA has nothing to drift from', () => {
    expect(view.panels['1001']?.drift.alert).toBe(false);
    expect(view.panels['1001']?.drift.sentence).toContain('at or above it, so there is nothing to drift from');
  });

  it('places the live drawdown in the Monte Carlo band', () => {
    const band = ea(1003).drawdownBand;
    expect(band).not.toBeNull();
    if (band === null) return;
    expect(view.panels['1003']?.band?.sentence).toBe(bandSentence(band));
    expect(view.panels['1003']?.band?.sentence).toContain('deeper than every one of 2,000 paths');
    expect(view.panels['1003']?.band?.sentence).toContain('outside the');
    expect(view.panels['1001']?.band?.sentence).toContain('inside the');
    expect(view.panels['1001']?.band?.method).toContain('move together');
  });

  it('lists correlations strongest first, with overlap, and explains the same bet', () => {
    const rows = view.panels['1001']?.correlations ?? [];
    expect(rows.map((row) => row.magic)).toEqual([1002, 1003]);
    expect(rows[0]?.sameBet).toBe(true);
    expect(rows[0]?.note).toBe(SAME_BET_SENTENCE);
    expect(rows[0]?.overlapText).toBe('65 shared days');
    expect(rows[1]?.valueText).toBe(correlationText(-0.237));
    expect(rows[1]?.note).toBeNull();
  });
});

describe('the matrix', () => {
  it('is square, blank on the diagonal and symmetric', () => {
    const { rows } = view.matrix;
    expect(rows).toHaveLength(3);
    for (const [i, row] of rows.entries()) {
      expect(row.cells[i]?.self).toBe(true);
      for (const [j, cell] of row.cells.entries()) expect(cell.text).toBe(rows[j]?.cells[i]?.text);
    }
    expect(rows[0]?.cells[1]?.text).toBe('0.84');
    expect(rows[0]?.cells[1]?.sameBet).toBe(true);
    expect(rows[0]?.cells[2]?.intensity).toBe(0);
  });
});

describe('correlation text', () => {
  it('prints two decimals with a real minus', () => {
    expect(correlationText(0.836)).toBe('0.84');
    expect(correlationText(-0.237)).toBe('−0.24');
    expect(correlationText(-0.001)).toBe('0.00');
  });
});

describe('a sparse account', () => {
  const settings = assay.settings;
  const base = ea(1001);

  it('with no EA trades is an empty sky: no stars, nothing invented', () => {
    const empty = buildConstellationView({
      constellation: {
        eas: [],
        correlations: [],
        summary: { eaCount: 0, assayedCount: 0, averageFineness: null, sameBetPairs: 0, driftingMagics: [] },
      },
      settings,
      currency: 'USD',
    });
    expect(empty.empty).toBe(true);
    expect(empty.stars).toEqual([]);
    expect(empty.threads).toEqual([]);
    expect(empty.drifting).toBeNull();
  });

  it('marks a pair without enough overlap instead of claiming a number', () => {
    const other: EaResult = { ...base, magic: 2002, name: 'Night Grid' };
    const sparse = buildConstellationView({
      constellation: {
        eas: [base, other],
        correlations: [{ a: 1001, b: 2002, correlation: null, sameBet: false, overlapDays: 4, enoughOverlap: false }],
        summary: { eaCount: 2, assayedCount: 2, averageFineness: 900, sameBetPairs: 0, driftingMagics: [] },
      },
      settings,
      currency: 'USD',
    });
    expect(sparse.threads).toEqual([]);
    expect(sparse.panels['1001']?.correlations[0]?.valueText).toBe('Not enough overlap');
    expect(sparse.panels['1001']?.correlations[0]?.overlapText).toBe('4 shared days');
    expect(sparse.matrix.rows[0]?.cells[1]?.text).toBe('·');
    expect(sparse.matrix.rows[0]?.cells[1]?.ariaLabel).toContain('not enough overlap');
  });

  it('says so when an EA is too new to assay', () => {
    const young: EaResult = { ...base, fineness: null, label: null, tradeCount: 7 };
    expect(finenessText(young.fineness)).toBe('Not assayed');
    const sparse = buildConstellationView({
      constellation: {
        eas: [young],
        correlations: [],
        summary: { eaCount: 1, assayedCount: 0, averageFineness: null, sameBetPairs: 0, driftingMagics: [] },
      },
      settings,
      currency: 'USD',
    });
    expect(sparse.stars[0]?.tone).toBe('unassayed');
    expect(sparse.panels['1001']?.finenessNote).toBe('Fineness needs 20 trades; Gold Scalper has 7.');
    expect(sparse.summary[1]?.value).toBe('—');
  });

  it('writes the in-band drift sentence for an EA below its baseline but inside the line', () => {
    const inside: EaResult = {
      ...base,
      drift: { ...base.drift, alert: false, standardErrors: 1.2, recentExpectancyR: 0.12, baselineExpectancyR: 0.28, thresholdR: 0.008 },
    };
    expect(driftSentence(inside)).toBe(
      'The last 20 trades average +0.12R against a +0.28R baseline — 1.20 standard errors below it, inside the drift line at +0.01R (2 × SE 0.14R).',
    );
  });
});
