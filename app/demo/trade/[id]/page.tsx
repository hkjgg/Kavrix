import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { DossierScreen } from '@/components/dossier/DossierScreen';
import { buildDossier } from '@/components/dossier/dossier';
import { getDemoDossierSources } from '@/lib/demo/dossier';
import { parseLedgerQuery } from '@/lib/ledger/query';

/**
 * `/demo/trade/[id]` — the Trade Dossier (CLAUDE.md §4, §17 Stage 4).
 *
 * Rendered on request, because the Ledger's filter travels in the query
 * string and decides the Dossier's previous and next. Everything it reads is
 * memoised for the life of the process, so a request costs one Similar
 * Trades search and one fold of M1 bars into candles.
 */

type SearchParams = Record<string, string | string[] | undefined>;

interface DossierPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: DossierPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${decodeURIComponent(id)} · Trade Dossier — Kavrix demo`,
    description: 'One trade on the demo account: its Hallmark, the market around it, what its impurities cost, and the trades that looked like it.',
  };
}

export default async function DossierPage({ params, searchParams }: DossierPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const view = buildDossier(decodeURIComponent(id), getDemoDossierSources(), parseLedgerQuery(search));
  if (view === null) notFound();

  return (
    <AppShell accountLabel="XAUUSD · Demo" periodLabel="Last 90 days" current="ledger" demo>
      <DossierScreen view={view} />
    </AppShell>
  );
}
