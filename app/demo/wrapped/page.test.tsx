import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WrappedPage } from '@/components/wrapped/WrappedPage';
import { getDemoWrappedView } from '@/lib/demo/wrapped';
import WrappedIndexPage from './page';
import WrappedMonthPage, { generateStaticParams } from './[month]/page';
import VerifyPage, { generateStaticParams as verifyParams } from '../../verify/[serial]/page';

/**
 * `/wrapped` prerendered: the story as real HTML, one chapter showing, every
 * other one in the markup and inactive. Expected values come from the view.
 */

const markup = renderToStaticMarkup(WrappedIndexPage());
const august = getDemoWrappedView('2026-08');

const chapterStates = (html: string) =>
  [...html.matchAll(/<section id="(chapter-[a-z]+)"([^>]*)>/g)].map((match) => [
    match[1],
    (match[2] ?? '').includes('data-inactive=""') ? 'inactive' : 'active',
  ]);

describe('/demo/wrapped', () => {
  it('opens on the last full month, August, with "Demo data" in the header', () => {
    expect(markup).toContain('Wrapped · <span class="text-text-2">August 2026</span>');
    expect(markup).toContain('Demo data');
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/demo\/wrapped\/2026-08"|href="\/demo\/wrapped\/2026-08"[^>]*aria-current="page"/);
  });

  it('renders all eight chapters, the first one showing', () => {
    const states = chapterStates(markup);
    expect(states.map(([id]) => id)).toEqual(august.chapters.map((chapter) => `chapter-${chapter.kind}`));
    expect(states.filter(([, state]) => state === 'active')).toEqual([['chapter-karat', 'active']]);
    for (const chapter of august.chapters) expect(markup).toContain(chapter.headline);
  });

  it('draws the month’s Karat on the dial, against July', () => {
    expect(markup).toContain('21.9K');
    expect(markup).toContain('vs July');
    expect(markup).toContain('Aug 2026 · 66 trades');
  });

  it('has a progress line, Back and Next, and a way out', () => {
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="1"');
    expect(markup).toContain('aria-valuemax="8"');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*?Back/);
    expect(markup).toContain('aria-label="Leave Wrapped (Esc)"');
  });

  it('ends on the certificate, with both downloads, Copy link and the demo engraving', () => {
    expect(markup).toContain('href="/api/certificate?month=2026-08&amp;format=post"');
    expect(markup).toContain('href="/api/certificate?month=2026-08&amp;format=story"');
    expect(markup).toContain('download="kavrix-assay-demo-088723-post.png"');
    expect(markup).toContain('Copy link');
    expect(markup).toContain('DEMO DATA');
    expect(markup).toContain('KAVRIX ASSAY · 21.9K · AUGUST 2026 · No. DEMO-088723');
  });

  it('shows every chapter without script', () => {
    expect(markup).toContain('<noscript><style>.wrapped-chapter[data-inactive]{display:flex}');
  });
});

describe('/demo/wrapped/[month]', () => {
  it('prerenders every month of the demo', () => {
    expect(generateStaticParams()).toEqual([
      { month: '2026-06' },
      { month: '2026-07' },
      { month: '2026-08' },
      { month: '2026-09' },
    ]);
  });

  it('labels September month to date, down to the certificate', async () => {
    const html = renderToStaticMarkup(await WrappedMonthPage({ params: Promise.resolve({ month: '2026-09' }) }));
    expect(html).toContain('month to date');
    expect(html).toContain('September 2026, so far, assayed at 22.6K.');
    expect(html).toContain('SEPTEMBER 2026 · MONTH TO DATE');
  });

  it('drops July’s Proof chapter cleanly', async () => {
    const html = renderToStaticMarkup(await WrappedMonthPage({ params: Promise.resolve({ month: '2026-07' }) }));
    const ids = chapterStates(html).map(([id]) => id);
    expect(ids).not.toContain('chapter-proof');
    expect(ids).toHaveLength(7);
    expect(html).toContain('aria-valuemax="7"');
  });

  it('shows "Assaying…" instead of a story for a month under ten trades', () => {
    const view = { ...august, state: 'assaying' as const, tradeCount: 7, chapters: [] };
    const html = renderToStaticMarkup(<WrappedPage view={view} demo />);
    expect(html).toContain('Assaying…');
    expect(html).toContain('holds 7 manual trades');
    expect(html).not.toContain('role="progressbar"');
  });
});

describe('/verify/[serial]', () => {
  it('knows the demo’s four serials and shows only Karat, tier, period and trade count', async () => {
    expect(verifyParams().map((entry) => entry.serial)).toEqual(['DEMO-975389', 'DEMO-197770', 'DEMO-088723', 'DEMO-311104']);
    const html = renderToStaticMarkup(await VerifyPage({ params: Promise.resolve({ serial: 'DEMO-088723' }) }));
    expect(html).toContain('No. DEMO-088723');
    expect(html).toContain('21.9K · 18K · Solid');
    expect(html).toContain('66 over 21 trading days');
    expect(html).toContain('Demo data');
    expect(html).not.toMatch(/\$\d/);
  });
});
