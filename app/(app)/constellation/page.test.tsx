import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConstellationBody } from '@/components/constellation/ConstellationBody';
import { EaPanel } from '@/components/constellation/EaPanel';
import { SAME_BET_SENTENCE, buildConstellationView } from '@/components/constellation/constellation';
import { getDemoAssay } from '@/lib/demo/assay';
import { getDemoConstellation } from '@/lib/demo/constellation';
import ConstellationPage from './page';

/**
 * `/constellation` prerendered, an EA panel rendered for real demo EAs, and
 * the empty sky. Expected values are read from the engine, never written in.
 */

const markup = renderToStaticMarkup(ConstellationPage());
const assay = getDemoAssay();
const view = getDemoConstellation();

function panel(magic: number): string {
  const found = view.panels[String(magic)];
  if (found === undefined) throw new Error(`no panel ${magic}`);
  return renderToStaticMarkup(<EaPanel panel={found} onClose={() => undefined} headingRef={null} />);
}

describe('/constellation', () => {
  it('is headed 04 — Constellation and carries the demo badge', () => {
    expect(markup).toMatch(/04 (&mdash;|—)/);
    expect(markup).toContain('Constellation');
    expect(markup).toContain('Demo data');
  });

  it('lights the Constellation in the nav', () => {
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/constellation"/);
    expect(markup).toContain('href="/wrapped"');
  });

  it('shows the summary row from the engine', () => {
    const { summary } = assay.constellation;
    expect(markup).toContain(`${summary.averageFineness?.toFixed(1)}‰`);
    expect(markup).toContain('Same-bet pairs');
    expect(markup).toContain('Drifting');
  });

  it('draws every EA as a real button, before any script runs', () => {
    for (const ea of assay.constellation.eas) {
      expect(markup).toContain(`aria-label="${ea.name}, magic ${ea.magic}.`);
    }
    expect(markup.match(/<button type="button"[^>]*aria-pressed="false"/g)).toHaveLength(3);
    expect(markup).toContain('Same bet · 0.84');
  });

  it('describes the sky in words', () => {
    expect(markup).toContain('<figcaption class="sr-only">3 EAs drawn as stars');
    expect(markup).toContain('Same bet: Gold Scalper · London Breakout.');
  });

  it('holds its size: the sky and the charts have a fixed aspect ratio', () => {
    expect(markup).toContain(`aspect-ratio:${view.width} / ${view.height}`);
  });

  it('prints the correlation matrix with a sticky names column', () => {
    expect(markup).toContain('Correlation matrix');
    expect(markup).toContain('overflow-x-auto');
    expect(markup).toContain('sticky left-0');
    expect(markup).toContain('London Breakout and Gold Scalper: 0.84 over 65 shared days, same bet');
  });

  it('opens no panel until a star is chosen', () => {
    expect(markup).toContain('Choose a star to assay its EA');
    expect(markup).toContain('Open the drifting EA — Grid Recovery');
    expect(markup).not.toContain('EA Health · Magic');
  });
});

describe('the EA panel', () => {
  it('for a drifting EA: the ‰ stamp, the alert and a way into its trades', () => {
    const html = panel(1003);
    const ea = assay.constellation.eas.find((candidate) => candidate.magic === 1003);
    expect(html).toContain('EA Health · Magic 1003');
    expect(html).toContain(`${ea?.fineness?.toFixed(1)}‰`);
    expect(html).toContain('Drifting');
    expect(html).toContain('past the drift line');
    expect(html).toContain('outside the');
    expect(html).toContain('href="/ledger?source=1003"');
    expect(html).not.toContain(SAME_BET_SENTENCE);
  });

  it('for a same-bet EA: the pair and the sentence', () => {
    const html = panel(1001);
    expect(html).toContain('Same bet');
    expect(html).toContain(SAME_BET_SENTENCE);
    expect(html).toContain('65 shared days');
  });
});

describe('with no EA trades', () => {
  const empty = buildConstellationView({
    constellation: {
      eas: [],
      correlations: [],
      summary: { eaCount: 0, assayedCount: 0, averageFineness: null, sameBetPairs: 0, driftingMagics: [] },
    },
    settings: assay.settings,
    currency: 'USD',
  });
  const html = renderToStaticMarkup(<ConstellationBody view={empty} />);

  it('explains grouping by magic number and draws no stars', () => {
    expect(html).toContain('No EA trades yet');
    expect(html).toContain('magic number');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<svg');
  });
});
