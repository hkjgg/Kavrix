import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccountShell } from '@/components/app/AccountShell';
import { DossierScreen } from '@/components/dossier/DossierScreen';
import { buildDossier } from '@/components/dossier/dossier';
import { loadAccountSurface } from '@/lib/account/surface';
import { parseLedgerQuery } from '@/lib/ledger/query';
import { APP_ROUTES } from '@/lib/routes';
import { accountDigits, buildDossierSources, buildLedger } from '@/lib/views/account';

/**
 * `/trade/[id]` — one of the trader's own trades (CLAUDE.md §4). The connector
 * sends deals, not prices, so a real account's Dossier has no candles yet
 * (ROADMAP.md): the chart shows its empty state, and everything else is the
 * engine's, exactly as in the demo.
 */

type SearchParams = Record<string, string | string[] | undefined>;

interface DossierPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: DossierPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `${decodeURIComponent(id)} · Trade Dossier — Kavrix` };
}

export const dynamic = 'force-dynamic';

export default async function DossierPage({ params, searchParams }: DossierPageProps) {
  const [{ id }, search, surface] = await Promise.all([params, searchParams, loadAccountSurface()]);
  if (surface.kind !== 'ready') {
    return <AccountShell surface={surface} current="ledger" periodLabel="All history" />;
  }
  const { rows } = buildLedger(surface.assay, surface.dataset);
  const sources = buildDossierSources(surface.assay, surface.dataset, rows, {
    bars: null,
    digits: accountDigits(surface.dataset),
    routes: APP_ROUTES,
  });
  const view = buildDossier(decodeURIComponent(id), sources, parseLedgerQuery(search));
  if (view === null) notFound();

  return (
    <AccountShell surface={surface} current="ledger" periodLabel="All history">
      <DossierScreen view={view} />
    </AccountShell>
  );
}
