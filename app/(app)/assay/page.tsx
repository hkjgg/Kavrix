import type { Metadata } from 'next';
import { AccountShell } from '@/components/app/AccountShell';
import { AssayScreen } from '@/components/assay/AssayScreen';
import { loadAccountSurface } from '@/lib/account/surface';

/**
 * `/assay` — the signed-in trader's Assay (CLAUDE.md §4, §15). The same screen
 * as `/demo`, over the trades the Kavrix Connector sent, scored with the
 * trader's own thresholds as of now. Before the first sync it is the
 * onboarding steps, and no numbers.
 */

export const metadata: Metadata = { title: 'The Assay — Kavrix' };
export const dynamic = 'force-dynamic';

export default async function AssayPage() {
  const surface = await loadAccountSurface();
  return (
    <AccountShell surface={surface} current="assay" periodLabel="Last 30 days">
      {surface.kind === 'ready' ? <AssayScreen assay={surface.assay} /> : null}
    </AccountShell>
  );
}
