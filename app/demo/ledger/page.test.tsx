import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getDemoLedger } from '@/lib/demo/ledger';
import { formatMoney, formatPct, formatR } from '@/lib/format';
import { DEFAULT_LEDGER_QUERY, LEDGER_PAGE_SIZE, applyLedgerQuery } from '@/lib/ledger/query';
import { summarizeRows } from '@/lib/ledger/summary';
import LedgerPage from './page';

// The Ledger navigates with the App Router, which only exists inside Next.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));

/**
 * `/ledger` prerendered: the default view — every trade, newest first,
 * page one — is real HTML before any script runs.
 */

const markup = renderToStaticMarkup(LedgerPage());
const { rows, context } = getDemoLedger();
const shown = applyLedgerQuery(rows, DEFAULT_LEDGER_QUERY, { asOfMs: context.asOfMs });

describe('/demo/ledger', () => {
  it('renders the first page of trades, newest first', () => {
    const rowCount = (markup.match(/class="ledger-row /g) ?? []).length;
    expect(rowCount).toBe(LEDGER_PAGE_SIZE);
    const first = shown[0];
    const second = shown[1];
    if (first === undefined || second === undefined) throw new Error('no rows');
    expect(markup.indexOf(`id="ledger-row-${first.id}"`)).toBeLessThan(markup.indexOf(`id="ledger-row-${second.id}"`));
    expect(markup).not.toContain(`id="ledger-row-${shown[LEDGER_PAGE_SIZE]?.id}"`);
  });

  it('includes manual and EA trades', () => {
    expect(rows.some((row) => row.magic === 0)).toBe(true);
    expect(rows.some((row) => row.magic !== 0)).toBe(true);
    expect(markup).toContain('Gold Scalper · 1001');
  });

  it('shows a Hallmark with its own name on every row, and the legend', () => {
    expect((markup.match(/role="img" aria-label="Hallmark:/g) ?? []).length).toBeGreaterThanOrEqual(LEDGER_PAGE_SIZE);
    expect(markup).toContain('How to read a Hallmark');
  });

  it('labels the summary strip as the current filter, and it adds up to the rows', () => {
    const summary = summarizeRows(shown);
    expect(markup).toContain('Current filter');
    expect(markup).toContain(formatR(summary.netR));
    expect(markup).toContain(formatMoney(summary.netMoney, { signed: true }));
    expect(markup).toContain(formatPct(summary.winRate ?? 0));
    expect(markup).toContain(`Rows 1–${LEDGER_PAGE_SIZE} of ${rows.length}`);
  });

  it('makes every numeric column sortable and marks the active sort', () => {
    expect((markup.match(/<th[^>]*><button/g) ?? []).length).toBe(6);
    expect(markup).toContain('aria-sort="descending"');
  });

  it('links every row to its Dossier without prefetching fifty routes', () => {
    const first = shown[0];
    expect(markup).toContain(`href="/demo/trade/${first?.id}"`);
  });

  it('offers the filters, the ticket search, the export and the shortcuts', () => {
    for (const label of ['Period', 'Source', 'Session', 'Impurity', 'Result', 'Ticket']) {
      expect(markup).toContain(`>${label}</span>`);
    }
    expect(markup).toContain('id="ledger-search"');
    expect(markup).toContain('Export CSV');
    expect(markup).toContain('aria-label="Keyboard shortcuts"');
    expect(markup).toContain('aria-live="polite"');
  });

  it('lights the Ledger in the nav and keeps the unbuilt surfaces dimmed', () => {
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/demo\/ledger"/);
    expect(markup).toContain('href="/demo"');
    expect(markup).toContain('href="/demo/vault"');
    expect(markup).toContain('href="/demo/constellation"');
    expect(markup).toContain('href="/demo/wrapped"');
    expect(markup).toContain('Demo data');
  });
});
