import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { VaultBody } from '@/components/vault/VaultBody';
import { getDemoVault } from '@/lib/demo/vault';

/**
 * `/demo/vault` — The Vault (CLAUDE.md §4, §8.7, §17 Stage 5).
 *
 * The 90-day history as shelves of bullion, one ingot a day — cast in the
 * metal of the day's Karat, with a strip beneath for its P&L — and the Day
 * Assay (§6.11) for any day of it, over the demo account. A signed-in
 * trader's own Vault is `/vault`; the body is shared.
 *
 * Prerendered: the shelves are real HTML before any script runs. The day a
 * reader opens is read from the query string (`?day=`) as the page hydrates.
 */

export const metadata: Metadata = {
  title: 'The Vault — Kavrix demo',
  description:
    'Ninety days of XAUUSD trading as shelves of bullion — each day an ingot cast in the metal of its Karat, with an assay strip for its P&L — and the Day Assay of any day. Demo data, deterministic seed.',
};

export const dynamic = 'force-static';

export default function VaultPage() {
  const view = getDemoVault();

  return (
    <AppShell accountLabel="XAUUSD · Demo" periodLabel="Last 90 days" current="vault" demo>
      <VaultBody view={view} />
    </AppShell>
  );
}
