import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { WrappedPage } from '@/components/wrapped/WrappedPage';
import { loadAccountWrapped } from '@/lib/account/wrapped';

/** `/wrapped` — the trader's last full month, in chapters, ending in the certificate. */

export const metadata: Metadata = { title: 'Wrapped — Kavrix' };
export const dynamic = 'force-dynamic';

export default async function WrappedIndexPage() {
  const result = await loadAccountWrapped(null);
  if (result.kind === 'empty') redirect('/assay');
  if (result.kind === 'missing') notFound();
  return <WrappedPage view={result.view} demo={false} />;
}
