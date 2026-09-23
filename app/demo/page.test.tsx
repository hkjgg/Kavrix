import { existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDemoAssay } from '@/lib/demo/assay';
import { GAP_VS_WHAT_IF, findingPeriodLabel } from '@/components/assay/explain';
import { formatKarat, formatMoney } from '@/lib/format';
import DemoPage from './page';

/**
 * `/demo` renders what the engine computed — and nothing it did not.
 *
 * The page is a server component with no I/O, so it can be rendered straight
 * to markup here. The assertions all read their expected value out of
 * `getDemoAssay()`: the test checks that the screen shows the engine's number,
 * never that the number is any particular one. Those are the engine's own
 * tests' job.
 */

const markup = renderToStaticMarkup(DemoPage());
const assay = getDemoAssay();

describe('/demo', () => {
  it('shows the Karat value the engine computed', () => {
    expect(assay.karat.karat).not.toBeNull();
    const karat = formatKarat(assay.karat.karat ?? Number.NaN);
    expect(karat).toBe('23.1K');
    expect(markup).toContain(karat);
  });

  it('shows the tier and the week-on-week move beside it', () => {
    expect(markup).toContain(assay.karat.tier?.label ?? '');
    expect(markup).toContain(formatKarat(assay.delta.delta ?? Number.NaN, { signed: true }));
    expect(markup).toContain('vs last week');
  });

  it('gives the dial a text alternative', () => {
    expect(markup).toContain('Karat 23.1K, 22K Refined, up 0.3K vs last week');
  });

  it('renders the dial at the value, so a reader without JavaScript is not shown 0K', () => {
    // 23.1K on a 270° scale: −135 + 23.1 × 11.25.
    expect(markup).toContain('rotate(124.875deg)');
  });

  it('shows every pillar with its points', () => {
    for (const pillar of assay.karat.pillars) {
      expect(markup).toContain(pillar.label);
      expect(markup).toContain(pillar.points.toFixed(1));
    }
  });

  it('labels every pillar value with its window and weighting', () => {
    const labels = markup.match(/30-day · recency-weighted/g) ?? [];
    // Six sub-dials, each with a visible label and an accessible name, plus the reading.
    expect(labels.length).toBeGreaterThanOrEqual(assay.karat.pillars.length * 2);
    for (const pillar of assay.karat.pillars) {
      expect(markup).toContain(
        `${pillar.label}, ${pillar.points.toFixed(1)} of ${pillar.maxPoints} points, 30-day · recency-weighted`,
      );
    }
  });

  it('wires every sub-dial to the in-place explanation, closed on arrival', () => {
    expect(markup.match(/aria-expanded="false"/g)?.length).toBe(assay.karat.pillars.length);
    expect(markup).not.toContain('aria-expanded="true"');
  });

  it('draws the instrument in its final state, so nothing depends on the arrival playing', () => {
    // The sequence is declared in CSS and only runs once a scene is seen;
    // the markup itself is already the finished instrument.
    expect(markup).toContain('class="scene"');
    expect(markup).not.toContain('data-inview');
    expect(markup).toContain('--hand-to:124.875deg');
  });

  it('shows the Karat Gap for the 30-day window', () => {
    expect(markup).toContain(
      formatMoney(-assay.gap.totalCostMoney, {
        currency: assay.gap.currency,
        signed: true,
      }),
    );
    expect(markup).toContain('30-day window');
    expect(markup).toContain('90-day total');
  });

  it('leads the Refinery with the engine’s top three findings', () => {
    expect(assay.refinery).toHaveLength(3);
    for (const finding of assay.refinery) {
      expect(markup).toContain(finding.headline);
    }
  });

  it('labels each finding with its own period', () => {
    for (const finding of assay.refinery) {
      expect(markup).toContain(`${findingPeriodLabel(finding, assay)} · unweighted`);
    }
  });

  it('sets the Gap as two bullion bars and the difference between them', () => {
    const all = assay.counterfactual.scenarios.find((scenario) => scenario.key === 'all');
    if (all === undefined) throw new Error('no "every impurity" scenario');
    const money = (value: number): string => formatMoney(value, { currency: 'USD', signed: true });

    expect(markup).toContain('Actual result');
    expect(markup).toContain(money(assay.counterfactual.actualEndMoney));
    expect(markup).toContain('Every impurity removed');
    expect(markup).toContain(money(all.endMoney));
    expect(markup).toContain(money(all.deltaMoney));
    expect(markup).toContain('Counterfactual, not a promise');
  });

  it('says how the Gap and the bars relate, in the drawers’ own words', () => {
    // The sentence carries an em dash, which the markup escapes; compare its first clause.
    expect(markup).toContain(GAP_VS_WHAT_IF.split(' — ')[0]);
  });

  it('has no loading boundary, so the prerendered page is readable without JavaScript', () => {
    // A `loading.tsx` makes Next stream the finished page into a `<div hidden>`
    // that only a script reveals. The route is static; it needs no fallback.
    expect(existsSync(new URL('./loading.tsx', import.meta.url))).toBe(false);
  });

  it('shows Your Proof with the difference between the buckets', () => {
    expect(assay.proof.visible).toBe(true);
    expect(markup).toContain('Discipline paid you');
  });

  it('labels the demo honestly and keeps the shell navigable', () => {
    expect(markup).toContain('Demo data');
    expect(markup).toContain('KAVRIX');
    expect(markup).toContain('XAUUSD · Demo');
    expect(markup).toContain('Last 30 days');
    expect(markup).toContain('01 \u2014');
    expect(markup).toContain('The Assay');
  });

  it('introduces each scene with its editorial heading, in order', () => {
    const positions = ['The Assay', 'The Refinery', 'The Gap', 'Your Proof'].map((title) =>
      markup.indexOf(`<span>${title}</span>`),
    );
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const number of ['01', '02', '03', '04']) {
      expect(markup).toContain(`${number} \u2014`);
    }
  });

  it('links the Ledger and leaves the surfaces that do not exist yet disabled rather than broken', () => {
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/demo"/);
    expect(markup).toContain('href="/ledger"');
    expect(markup).not.toMatch(/aria-current="page"[^>]*href="\/ledger"/);
    expect(markup).not.toContain('href="/vault"');
  });
});
