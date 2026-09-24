import type { Metadata } from 'next';
import { AccountShell } from '@/components/app/AccountShell';
import { ConstellationSection } from '@/components/constellation/ConstellationSection';
import { loadAccountSurface } from '@/lib/account/surface';
import { APP_ROUTES } from '@/lib/routes';
import { buildConstellation } from '@/lib/views/account';

/** `/constellation` — EA Health for the trader's own EAs (§7, §8.8). */

export const metadata: Metadata = { title: 'Constellation — Kavrix' };
export const dynamic = 'force-dynamic';

export default async function ConstellationPage() {
  const surface = await loadAccountSurface();
  return (
    <AccountShell surface={surface} current="constellation" periodLabel="All history">
      {surface.kind === 'ready' ? <ConstellationSection view={buildConstellation(surface.assay, APP_ROUTES)} /> : null}
    </AccountShell>
  );
}
