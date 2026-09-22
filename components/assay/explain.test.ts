import { describe, expect, it } from 'vitest';
import { getDemoAssay } from '@/lib/demo/assay';
import type { Finding } from '@/lib/engine/findings';
import { formatMoney } from '@/lib/format';
import {
  EXPLAIN_IDS,
  buildExplainIndex,
  findingPeriodLabel,
  historyPeriodLabel,
  pillarScopeLabel,
  scopeNote,
} from './explain';

/**
 * Stage 3.5: every number says what period and weighting it covers.
 *
 * The Market Conditions pillar can score 9.1 / 10 while the Refinery leads
 * with a five-figure news-window loss. Both are right — the pillar is a
 * 30-day, recency-weighted score, the finding counts 90 days unweighted — and
 * these tests hold the page to saying so.
 */

const assay = getDemoAssay();
const index = buildExplainIndex(assay);

describe('scope labels', () => {
  it('names the pillars’ window and weighting from the settings, not a literal', () => {
    expect(pillarScopeLabel(assay.settings)).toBe('30-day · recency-weighted');
    expect(pillarScopeLabel({ ...assay.settings, rollingWindowDays: 14 })).toBe(
      '14-day · recency-weighted',
    );
  });

  it('names the whole history as days and dates', () => {
    expect(historyPeriodLabel(assay)).toBe('90 days · 2026-06-22 → 2026-09-20');
  });

  it('gives a history-wide finding the whole history, and "outside your normal" its own window', () => {
    const top = assay.refinery[0];
    if (top === undefined) throw new Error('the demo Refinery is empty');
    expect(findingPeriodLabel(top, assay)).toBe(historyPeriodLabel(assay));

    const outside: Finding = { ...top, kind: 'outside-normal' };
    expect(findingPeriodLabel(outside, assay)).toBe(
      `Last ${assay.baselines.recentDays} days · against your history`,
    );
  });
});

describe('the pillar and finding drawers explain why they can disagree', () => {
  it('prints the scope on every pillar value', () => {
    for (const pillar of assay.karat.pillars) {
      const entry = index[EXPLAIN_IDS.pillar(pillar.key)];
      expect(entry?.valueCaption?.startsWith('30-day · recency-weighted · ')).toBe(true);
    }
  });

  it('prints each finding’s own period, unweighted', () => {
    for (const finding of assay.refinery) {
      const entry = index[EXPLAIN_IDS.finding(finding.id)];
      expect(entry?.valueCaption).toContain(`${findingPeriodLabel(finding, assay)} · unweighted`);
    }
  });

  it('carries the same one sentence in both drawers', () => {
    const sentence = scopeNote(assay.settings);
    expect(sentence).toContain('last 30 days');
    expect(sentence).toContain('unweighted');

    for (const pillar of assay.karat.pillars) {
      expect(index[EXPLAIN_IDS.pillar(pillar.key)]?.scopeNote).toBe(sentence);
    }
    for (const finding of assay.refinery) {
      expect(index[EXPLAIN_IDS.finding(finding.id)]?.scopeNote).toBe(sentence);
    }
  });

  it('leaves the sentence off numbers that are not part of the disagreement', () => {
    expect(index[EXPLAIN_IDS.karat]?.scopeNote).toBeNull();
    expect(index[EXPLAIN_IDS.gapTotal('window')]?.scopeNote).toBeNull();
    expect(index[EXPLAIN_IDS.proof]?.scopeNote).toBeNull();
  });
});

describe('the What-if behind the bullion bars', () => {
  const entry = index[EXPLAIN_IDS.whatIf];
  const all = assay.counterfactual.scenarios.find((scenario) => scenario.key === 'all');

  it('exists, and carries the counterfactual label', () => {
    expect(entry).toBeDefined();
    expect(entry?.eyebrow).toContain('Counterfactual, not a promise');
  });

  it('reads its figures straight off the engine', () => {
    if (all === undefined || entry === undefined) throw new Error('no "every impurity" scenario');
    const money = (value: number): string => formatMoney(value, { currency: 'USD', signed: true });

    expect(entry.value).toBe(money(all.deltaMoney));
    const byLabel = new Map(entry.lines.map((line) => [line.label, line.value]));
    expect(byLabel.get('Actual result')).toBe(money(assay.counterfactual.actualEndMoney));
    expect(byLabel.get('Every impurity removed')).toBe(money(all.endMoney));
    expect(byLabel.get('Trades removed')).toBe(
      `${all.removedTradeCount} · ${all.removedWins} won · ${all.removedLosses} lost`,
    );
  });

  it('removes winners too, and says the Gap is a different number', () => {
    expect(all?.removedWins ?? 0).toBeGreaterThan(0);
    expect(entry?.note).toContain('not supposed to match');
  });
});
