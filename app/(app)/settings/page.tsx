import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { StatusDot } from '@/components/app/StatusDot';
import { EaForm, RevokeButton, ThresholdsForm, TokenGenerator } from '@/components/settings/SettingsForms';
import { SectionHeading } from '@/components/ui';
import { accountLabel, requireWorkspace, selectAll } from '@/lib/account/load';
import { connectorStatus, formatAge } from '@/lib/connector/status';
import { formatMoney } from '@/lib/format';
import { DEFAULT_THRESHOLDS } from '@/lib/settings/thresholds';
import type { Thresholds } from '@/lib/settings/thresholds';
import { siteOrigin } from '@/lib/site';

/**
 * `/settings` — the trader's thresholds (§6.1), connector tokens (§12) and
 * linked MT5 accounts. Everything here is read and written as the user,
 * under RLS; a token is shown once, when it is made, and never again.
 */

export const metadata: Metadata = { title: 'Settings — Kavrix' };
export const dynamic = 'force-dynamic';

const cellLabel = 'text-[10px] font-medium uppercase tracking-[2px] text-text-3';

function utc(value: string | null): string {
  return value === null ? '—' : `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default async function SettingsPage() {
  const workspace = await requireWorkspace();
  const { supabase, accounts, settings, nowMs } = workspace;

  const [tokens, eas, origin] = await Promise.all([
    supabase.from('connector_tokens').select('*').order('created_at', { ascending: false }),
    selectAll((from, to) => supabase.from('eas').select('*').order('account_id').order('magic').range(from, to)),
    siteOrigin(),
  ]);

  const thresholds: Thresholds =
    settings === null
      ? DEFAULT_THRESHOLDS
      : {
          riskLimitPercent: settings.risk_limit_percent,
          dailyMaxTrades: settings.daily_max_trades,
          newsWindowMinutes: settings.news_window_minutes,
          rolloverWindowMinutes: settings.rollover_window_minutes,
          serverUtcOffsetHours: settings.server_utc_offset_hours,
        };
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return (
    <AppShell
      surface="app"
      accountLabel={accountLabel(workspace.account)}
      periodLabel="—"
      current="settings"
      userEmail={workspace.user.email}
    >
      <div className="flex flex-col gap-16">
        <SectionHeading
          title="Settings"
          as="h1"
          subtitle="Your thresholds, your connector, your accounts. Changing a threshold re-assays every surface; it never changes a trade."
        />

        <section aria-labelledby="thresholds-heading" className="flex flex-col gap-6">
          <SectionHeading id="thresholds-heading" index="01" title="Discipline thresholds" subtitle="The Karat Score’s configurable rules (§6.1). The defaults are the spec’s." />
          <div className="rounded-card border border-line bg-surface-1 p-6">
            <ThresholdsForm initial={thresholds} />
          </div>
        </section>

        <section id="connector" aria-labelledby="connector-heading" className="flex scroll-mt-28 flex-col gap-6">
          <SectionHeading
            id="connector-heading"
            index="02"
            title="Connector tokens"
            subtitle="One token per MetaTrader 5 terminal. Paste it into the Kavrix Connector’s inputs; it links to the first account that uses it."
          />
          <div className="flex flex-col gap-8 rounded-card border border-line bg-surface-1 p-6">
            <TokenGenerator />
            <div className="flex flex-col gap-2 text-sm leading-relaxed text-text-2">
              <p>
                <a href="/api/connector" download className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
                  Download KavrixConnector.mq5
                </a>{' '}
                · in MetaTrader 5, allow WebRequest for <span className="break-all font-mono text-text">{origin}</span> (Tools → Options →
                Expert Advisors).
              </p>
            </div>

            {(tokens.data ?? []).length === 0 ? (
              <p className="text-sm text-text-3">No tokens yet.</p>
            ) : (
              <ul className="flex flex-col">
                {(tokens.data ?? []).map((token) => {
                  const linked = token.account_id === null ? null : accountById.get(token.account_id);
                  return (
                    <li key={token.id} className="grid gap-3 border-t border-line py-4 first:border-t-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <span className="block truncate text-sm text-text">{token.name}</span>
                        <span className="font-mono text-[11px] text-text-3">{token.prefix}…</span>
                      </div>
                      <div className="font-mono text-[11px] text-text-3">
                        <span className={`${cellLabel} block`}>Last seen</span>
                        {token.last_seen_at === null ? 'Never' : `${formatAge(nowMs - Date.parse(token.last_seen_at))} ago`}
                      </div>
                      <div className="font-mono text-[11px] text-text-3">
                        <span className={`${cellLabel} block`}>Account</span>
                        {linked ? `${linked.login} · ${linked.server}` : 'Not used yet'}
                      </div>
                      <div>
                        {token.revoked_at !== null ? (
                          <span className="text-[11px] uppercase tracking-[2px] text-text-3">Revoked {utc(token.revoked_at).slice(0, 10)}</span>
                        ) : (
                          <RevokeButton id={token.id} name={token.name} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="accounts-heading" className="flex flex-col gap-6">
          <SectionHeading id="accounts-heading" index="03" title="Linked MT5 accounts" subtitle="Linked by the connector the first time it syncs. The dot is lit only while heartbeats arrive." />
          {accounts.length === 0 ? (
            <p className="rounded-card border border-line bg-surface-1 p-6 text-sm text-text-3">
              None yet. Generate a token, install the connector, and your account appears here on its first heartbeat.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {accounts.map((account) => (
                <li key={account.id} className="grid gap-4 rounded-card border border-line bg-surface-1 p-6 sm:grid-cols-4">
                  <div>
                    <span className={`${cellLabel} block`}>Login · server</span>
                    <span className="mt-1.5 block font-mono text-sm text-text">{account.login}</span>
                    <span className="block truncate font-mono text-[11px] text-text-3">{account.server}</span>
                  </div>
                  <div>
                    <span className={`${cellLabel} block`}>Currency · leverage</span>
                    <span className="mt-1.5 block font-mono text-sm text-text-2">
                      {account.currency} · 1:{account.leverage}
                    </span>
                  </div>
                  <div>
                    <span className={`${cellLabel} block`}>Balance · equity</span>
                    <span className="mt-1.5 block font-mono text-sm text-text-2">{formatMoney(account.balance, { currency: account.currency })}</span>
                    <span className="block font-mono text-[11px] text-text-3">{formatMoney(account.equity, { currency: account.currency })}</span>
                  </div>
                  <div>
                    <span className={`${cellLabel} block`}>Connector</span>
                    <StatusDot status={connectorStatus(account.last_heartbeat_at, nowMs)} className="mt-1.5" />
                    <span className="block font-mono text-[11px] text-text-3">
                      {account.last_heartbeat_at === null ? '' : utc(account.last_heartbeat_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {eas.length > 0 ? (
          <section aria-labelledby="eas-heading" className="flex flex-col gap-6">
            <SectionHeading
              id="eas-heading"
              index="04"
              title="Expert Advisors"
              subtitle="Found by magic number. Name them, and enter a backtest’s expectancy and dispersion to measure Fineness against it (§7); leave both empty to use the EA’s first 50 live trades."
            />
            <div className="flex flex-col gap-5 rounded-card border border-line bg-surface-1 p-6">
              {eas.map((ea) => (
                <EaForm
                  key={`${ea.account_id}-${ea.magic}`}
                  accountId={ea.account_id}
                  magic={ea.magic}
                  name={ea.name}
                  baselineExpectancyR={ea.baseline_expectancy_r}
                  baselineStdDevR={ea.baseline_std_dev_r}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
