import type { Metadata } from 'next';
import { AccountShell } from '@/components/app/AccountShell';
import { VaultBody } from '@/components/vault/VaultBody';
import { loadAccountSurface } from '@/lib/account/surface';
import { buildVault, dayStories, replayAllDays } from '@/lib/views/account';

/** `/vault` — the trader's history as shelves of ingots, and the Day Assay (§8.7, §6.11). */

export const metadata: Metadata = { title: 'The Vault — Kavrix' };
export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  const surface = await loadAccountSurface();
  let body = null;
  if (surface.kind === 'ready') {
    const replay = replayAllDays(surface.assay);
    body = <VaultBody view={buildVault(surface.assay, replay, dayStories(surface.assay, replay, surface.dataset.calendar))} />;
  }
  return (
    <AccountShell surface={surface} current="vault" periodLabel="All history">
      {body}
    </AccountShell>
  );
}
