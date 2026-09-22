import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDemoAssay } from '@/lib/demo/assay';
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

  it('leaves the surfaces that do not exist yet disabled rather than broken', () => {
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain('href="/ledger"');
    expect(markup).not.toContain('href="/vault"');
  });
});
