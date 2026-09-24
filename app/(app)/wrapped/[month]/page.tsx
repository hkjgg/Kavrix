import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WrappedPage } from '@/components/wrapped/WrappedPage';
import { getDemoWrappedMonths, getDemoWrappedView, isDemoMonth } from '@/lib/demo/wrapped';
import { monthLabel } from '@/lib/dates';

/**
 * `/wrapped/YYYY-MM` — one month's Wrapped (CLAUDE.md §17 Stage 7).
 * Every month of the demo history is prerendered; any other month is a 404.
 */

export const dynamicParams = false;

export function generateStaticParams(): { month: string }[] {
  return getDemoWrappedMonths().map((month) => ({ month }));
}

type Params = Promise<{ month: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { month } = await params;
  return {
    title: `Wrapped · ${isDemoMonth(month) ? monthLabel(month) : 'Not found'} — Kavrix demo`,
    description: 'A month of XAUUSD discipline in chapters, ending in the Assay Certificate. Demo data, deterministic seed.',
  };
}

export default async function WrappedMonthPage({ params }: { params: Params }) {
  const { month } = await params;
  if (!isDemoMonth(month)) notFound();
  return <WrappedPage view={getDemoWrappedView(month)} demo />;
}
