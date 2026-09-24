import type { ReactNode } from 'react';
import type { AccountSurface } from '@/lib/account/surface';
import { accountLabel } from '@/lib/account/load';
import { siteOrigin } from '@/lib/site';
import { AppShell } from './AppShell';
import { ConnectMt5 } from './ConnectMt5';
import type { NavKey } from './PrimaryNav';

/**
 * The shell of a signed-in page. When the account has nothing to assay yet,
 * it draws the onboarding steps instead of the surface — the same on every
 * page, so no surface ever shows a number the data does not have.
 */
export async function AccountShell({
  surface,
  current,
  periodLabel,
  children,
}: {
  surface: AccountSurface;
  current: NavKey;
  periodLabel: string;
  children?: ReactNode;
}) {
  const { workspace } = surface;
  let content = children;

  if (surface.kind === 'empty') {
    const [origin, tokens] = await Promise.all([
      siteOrigin(),
      workspace.supabase.from('connector_tokens').select('id', { count: 'exact', head: true }).is('revoked_at', null),
    ]);
    content = (
      <ConnectMt5
        reason={surface.reason}
        origin={origin}
        hasActiveToken={(tokens.count ?? 0) > 0}
        account={workspace.account}
        nowMs={workspace.nowMs}
      />
    );
  }

  return (
    <AppShell
      surface="app"
      accountLabel={accountLabel(workspace.account)}
      periodLabel={surface.kind === 'empty' ? '—' : periodLabel}
      current={current}
      userEmail={workspace.user.email}
    >
      {content}
    </AppShell>
  );
}
