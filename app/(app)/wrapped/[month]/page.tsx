import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { WrappedPage } from '@/components/wrapped/WrappedPage';
import { loadAccountWrapped } from '@/lib/account/wrapped';
import { monthLabel } from '@/lib/dates';
import { isMonthKey } from '@/lib/engine';

/** `/wrapped/YYYY-MM` — one month of the trader's own Wrapped. */

type Params = Promise<{ month: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { month } = await params;
  return { title: `Wrapped · ${isMonthKey(month) ? monthLabel(month) : 'Not found'} — Kavrix` };
}

export const dynamic = 'force-dynamic';

export default async function WrappedMonthPage({ params }: { params: Params }) {
  const { month } = await params;
  if (!isMonthKey(month)) notFound();
  const result = await loadAccountWrapped(month);
  if (result.kind === 'empty') redirect('/assay');
  if (result.kind === 'missing') notFound();
  return <WrappedPage view={result.view} demo={false} />;
}
