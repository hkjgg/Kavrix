import Link from 'next/link';
import { SectionHeading } from '@/components/ui';
import { connectorStatus } from '@/lib/connector/status';
import type { AccountRow } from '@/lib/account/rows';
import { StatusDot } from './StatusDot';

/**
 * The empty state of a new account (CLAUDE.md §17 Stage 8): no numbers, only
 * the three steps between a trader and their first Assay. Once an account is
 * linked but has no closed trade yet, it says that instead — and shows the
 * connector's real heartbeat.
 */

export interface ConnectMt5Props {
  reason: 'no-account' | 'no-trades';
  /** The URL to allow in MetaTrader 5, e.g. `https://kavrix.app`. */
  origin: string;
  hasActiveToken: boolean;
  account: AccountRow | null;
  nowMs: number;
}

const linkClass = 'text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold';

export function ConnectMt5({ reason, origin, hasActiveToken, account, nowMs }: ConnectMt5Props) {
  const steps = [
    {
      title: 'Generate a connector token',
      done: hasActiveToken,
      body: (
        <>
          In <Link href="/settings#connector" className={linkClass}>Settings</Link>, generate a token and copy it. It is shown
          once; Kavrix keeps only its hash.
        </>
      ),
    },
    {
      title: 'Install the Kavrix Connector',
      done: account !== null,
      body: (
        <>
          <a href="/api/connector" className={linkClass} download>
            Download KavrixConnector.mq5
          </a>
          , put it in <span className="font-mono text-text">MQL5\Experts</span>, compile it in MetaEditor, attach it to any chart
          and paste the token into its inputs. It reads your history; it never places, changes or closes a trade.
        </>
      ),
    },
    {
      title: 'Allow the WebRequest URL',
      done: account !== null,
      body: (
        <>
          In MetaTrader 5: Tools → Options → Expert Advisors → tick “Allow WebRequest for listed URL” and add{' '}
          <span className="break-all font-mono text-text">{origin}</span>.
        </>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        index="01"
        title="Connect MetaTrader 5"
        as="h1"
        subtitle={
          reason === 'no-account'
            ? 'Kavrix measures your own trades. Three steps, once, and your Assay fills from your MT5 history.'
            : 'Your account is linked. The Assay fills as soon as the connector has sent a closed trade.'
        }
      />

      {account !== null ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-line bg-surface-1 px-6 py-4">
          <span className="font-mono text-xs text-text-2">
            {account.login} · {account.server} · {account.currency}
          </span>
          <StatusDot status={connectorStatus(account.last_heartbeat_at, nowMs)} />
          <span className="text-[11px] text-text-3">
            <span className="assaying">Assaying…</span> waiting for closed trades
          </span>
        </div>
      ) : null}

      <ol className="grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-4 rounded-card border border-line bg-surface-1 p-6">
            <div className="flex items-center justify-between gap-4">
              <span className="font-serif text-3xl text-gold">{String(index + 1).padStart(2, '0')}</span>
              {step.done ? (
                <span className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Done</span>
              ) : null}
            </div>
            <h2 className="text-base font-semibold text-text">{step.title}</h2>
            <p className="text-sm leading-relaxed text-text-2">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="text-sm text-text-3">
        Want to see what it looks like first? <Link href="/demo" className={linkClass}>Open the demo</Link> — 90 days of
        generated XAUUSD trading, labelled as such.
      </p>
    </div>
  );
}
