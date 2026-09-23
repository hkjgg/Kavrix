import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDemoAssay } from '@/lib/demo/assay';
import { formatR } from '@/lib/format';
import DossierPage from './page';

/** `/trade/[id]` rendered for the engine's own Similar Trades target. */

const assay = getDemoAssay();
const id = assay.similar[0]?.tradeId ?? '';
const trade = assay.trades.find((candidate) => candidate.id === id);

const render = async (search: Record<string, string>) =>
  renderToStaticMarkup(
    await DossierPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search) }),
  );

describe('/trade/[id]', () => {
  it('renders the header: Hallmark, figures, impurity badges', async () => {
    const markup = await render({});
    if (trade === undefined) throw new Error('no trade');
    expect(markup).toContain(`>${id}</h1>`);
    expect(markup).toContain('role="img" aria-label="Hallmark:');
    expect(markup).toContain(formatR(trade.rMultiple, { digits: 2 }));
    expect(markup).toContain('Trade Dossier · Manual');
    expect(markup).toContain('News window');
  });

  it('renders the three sections in order', async () => {
    const markup = await render({});
    const positions = ['The market around it', 'What it cost', 'Similar trades'].map((title) =>
      markup.indexOf(`<span>${title}</span>`),
    );
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('gives the chart a text alternative, so it reads without JavaScript', async () => {
    const markup = await render({});
    expect(markup).toContain('<figcaption');
    expect(markup).toMatch(/M\d+ candles|H1 candles/);
  });

  it('explains each impurity with its pillar and what the Gap billed', async () => {
    const markup = await render({});
    expect(markup).toContain('>Rule</dt>');
    expect(markup).toContain('>Pillar</dt>');
    expect(markup).toContain('Billed to ');
  });

  it('lists the twelve similar trades and says they closed before this one opened', async () => {
    const markup = await render({});
    expect(markup).toContain('closed before this trade opened');
    const table = markup.slice(markup.indexOf('most similar earlier trades'));
    expect((table.match(/aria-label="Hallmark:/g) ?? []).length).toBe(assay.settings.similarNeighbours);
  });

  it('keeps the Ledger’s filter in previous, next and back', async () => {
    const markup = await render({ source: 'manual', sort: 'r' });
    expect(markup).toContain('rel="prev"');
    expect(markup).toContain('rel="next"');
    expect(markup).toMatch(/href="\/trade\/T-\d+\?source=manual&amp;sort=r"/);
    expect(markup).toMatch(/href="\/ledger\?source=manual&amp;sort=r/);
    expect(markup).toContain('in the current filter');
  });

  it('lights the Ledger in the nav', async () => {
    const markup = await render({});
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/ledger"/);
    expect(markup).toContain('Demo data');
  });
});
