import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDemoAssay } from '@/lib/demo/assay';
import { formatMoney } from '@/lib/format';
import { PurityLine } from './PurityLine';
import { ExplainProvider } from './ExplainProvider';
import {
  DEFAULT_PURITY_STATE,
  buildPurityView,
  compactMoney,
  purityLayers,
  scenarioEquity,
} from './purity';

/**
 * The Purity Line draws the engine's curves and nothing else. Every expected
 * value is read out of the engine result.
 */

const assay = getDemoAssay();
const view = buildPurityView(assay);

function render(state = DEFAULT_PURITY_STATE): string {
  return renderToStaticMarkup(
    <ExplainProvider index={{}}>
      <PurityLine view={view} initialState={state} />
    </ExplainProvider>,
  );
}

describe('buildPurityView', () => {
  it('rebuilds the "every impurity" curve exactly as the engine computed it', () => {
    const values = scenarioEquity(assay, 'all');
    expect(values).toHaveLength(assay.counterfactual.curve.length);
    assay.counterfactual.curve.forEach((point, index) => {
      expect(values[index]).toBeCloseTo(point.counterfactualEquity, 1);
    });
  });

  it('ends every scenario curve on the scenario’s own end equity', () => {
    for (const scenario of assay.counterfactual.scenarios) {
      const values = scenarioEquity(assay, scenario.key);
      expect(values[values.length - 1]).toBeCloseTo(scenario.endEquity, 1);
    }
  });

  it('offers one toggle per engine scenario, with the engine’s figures', () => {
    expect(view.scenarios.map((scenario) => scenario.key)).toEqual(
      assay.counterfactual.scenarios.map((scenario) => scenario.key),
    );
    const all = assay.counterfactual.scenarios.find((scenario) => scenario.key === 'all');
    const allView = view.scenarios.find((scenario) => scenario.key === 'all');
    expect(allView?.deltaMoney).toBe(formatMoney(all?.deltaMoney ?? 0, { signed: true }));
    expect(allView?.removed).toBe(`${all?.removedTradeCount} trades removed · ${all?.removedWins} of them winners`);
  });

  it('stamps every impure manual trade, and only those, linked to its Dossier', () => {
    const impure = assay.trades.filter((trade) => trade.isManual && trade.impurities.length > 0);
    expect(view.stamps).toHaveLength(impure.length);
    expect(new Set(view.stamps.map((stamp) => stamp.tradeId))).toEqual(new Set(impure.map((trade) => trade.id)));
    const markup = render();
    for (const stamp of view.stamps) {
      expect(markup).toContain(`href="/trade/${stamp.tradeId}"`);
      expect(stamp.x).toBeGreaterThanOrEqual(0);
      expect(stamp.x).toBeLessThanOrEqual(100);
      expect(stamp.reasons.length).toBeGreaterThan(0);
    }
  });

  it('colours the line from the daily Karat series', () => {
    // One stop per day; the final point is read at the window's end, which
    // is the same instant as the day before it closes, so it adds nothing.
    expect(view.stops.length).toBeGreaterThanOrEqual(assay.series.length - 1);
    expect(view.stops.length).toBeLessThanOrEqual(assay.series.length);
    // The last days of the demo are disciplined: the line ends brighter than it starts.
    expect(view.stops[view.stops.length - 1]?.color).not.toBe(view.stops[0]?.color);
  });

  it('labels the axis compactly', () => {
    expect(compactMoney(25_000)).toBe('$25k');
    expect(compactMoney(27_500)).toBe('$27.5k');
  });
});

describe('the What-if toggle', () => {
  it('draws the account alone by default', () => {
    expect(purityLayers(view, DEFAULT_PURITY_STATE).counterfactual).toBeNull();
    const markup = render();
    expect(markup).toContain('data-series="actual"');
    expect(markup).toContain('data-layer="actual"');
    expect(markup).not.toContain('data-layer="counterfactual"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it('switches to a scenario’s series and labels the difference', () => {
    for (const scenario of view.scenarios) {
      const state = { whatIf: true, scenario: scenario.key };
      expect(purityLayers(view, state).counterfactual?.key).toBe(scenario.key);
      const markup = render(state);
      expect(markup).toContain(`data-series="actual+${scenario.key}"`);
      expect(markup).toContain('data-layer="counterfactual"');
      expect(markup).toContain(`data-difference="${scenario.key}"`);
      expect(markup).toContain(scenario.path.slice(0, 40));
      expect(markup).toContain(scenario.deltaMoney);
    }
  });

  it('carries "Counterfactual, not a promise" whether the What-if is on or off', () => {
    expect(render()).toContain('Counterfactual, not a promise');
    expect(render({ whatIf: true, scenario: 'revenge' })).toContain('Counterfactual, not a promise');
  });

  it('never moves the actual line when the What-if switches on', () => {
    const off = render();
    const on = render({ whatIf: true, scenario: 'market' });
    expect(on).toContain(view.actualPath);
    expect(off).toContain(view.actualPath);
  });
});
