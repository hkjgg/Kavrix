import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CertificateCard } from '@/components/wrapped/CertificateCard';
import { Badge } from '@/components/ui';
import { certificateAlt } from '@/components/viz/certificate';
import type { CertificateData } from '@/components/viz/certificate';
import { demoMonthForSerial, getDemoWrappedMonths, getDemoWrappedView } from '@/lib/demo/wrapped';
import { certificateSerial } from '@/lib/engine';
import { getDemoDataset } from '@/lib/demo/assay';
import { verifyCertificate } from '@/lib/account/verify';
import { monthLabel } from '@/lib/dates';

/**
 * `/verify/[serial]` — what a shared Assay Certificate stands for (CLAUDE.md
 * §17 Stage 7). A public surface, so it shows only what the certificate
 * itself shows: Karat, tier, hallmarks, period and trade count. Never money,
 * R totals or balances.
 *
 * The demo's serials are prerendered. Any other serial is looked up in
 * `certificates` through `verify_certificate`, which returns only those same
 * printed fields — never the account behind them.
 */

export function generateStaticParams(): { serial: string }[] {
  const { account } = getDemoDataset();
  return getDemoWrappedMonths().map((month) => ({ serial: certificateSerial(account, month, { demo: true }) }));
}

type Params = Promise<{ serial: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { serial } = await params;
  return { title: `Assay Certificate No. ${serial} — Kavrix`, description: 'Verify a Kavrix Assay Certificate.' };
}

interface Resolved {
  data: CertificateData;
  alt: string;
  /** `August 2026`. */
  label: string;
  /** The demo's Wrapped for the month. A real trader's Wrapped is private, so `null`. */
  wrappedHref: string | null;
}

async function resolve(serial: string): Promise<Resolved | null> {
  const month = demoMonthForSerial(serial);
  if (month !== null) {
    const view = getDemoWrappedView(month);
    const certificate = view.chapters.find((chapter) => chapter.kind === 'certificate');
    if (certificate?.kind !== 'certificate') return null;
    return { data: certificate.data, alt: certificate.alt, label: view.label, wrappedHref: view.href };
  }
  const verified = await verifyCertificate(serial);
  if (verified === null) return null;
  return { data: verified.data, alt: certificateAlt(verified.data), label: monthLabel(verified.month), wrappedHref: null };
}

export default async function VerifyPage({ params }: { params: Params }) {
  const { serial } = await params;
  const resolved = await resolve(decodeURIComponent(serial));
  if (resolved === null) notFound();
  const { data } = resolved;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1080px] flex-col gap-12 px-4 py-14 sm:px-8 lg:flex-row lg:items-center lg:gap-16">
      <div className="flex max-w-[30rem] flex-col gap-5">
        <Link href="/demo" className="sheen w-fit font-serif text-xl leading-none tracking-[0.42em]">
          KAVRIX
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[3px] text-text-3">Assay Certificate · verification</p>
        <h1 className="font-serif text-4xl leading-tight text-text sm:text-5xl">No. {data.serial}</h1>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 font-mono text-sm">
          <dt className="text-[10px] uppercase tracking-[2px] text-text-3">Karat</dt>
          <dd className="text-gold">{data.karat.toFixed(1)}K · {data.tier}</dd>
          <dt className="text-[10px] uppercase tracking-[2px] text-text-3">Period</dt>
          <dd className="text-text-2">
            {resolved.label} · {data.period}
            {data.partial ? ' · month to date' : ''}
          </dd>
          <dt className="text-[10px] uppercase tracking-[2px] text-text-3">Trades</dt>
          <dd className="text-text-2">
            {data.tradeCount} over {data.tradingDays} trading days
          </dd>
        </dl>
        {data.demo ? (
          <div className="flex flex-col gap-3">
            <Badge tone="gold" className="w-fit">Demo data</Badge>
            <p className="text-sm leading-relaxed text-text-2">
              Issued for the Kavrix demo account: a deterministic, generated history, not a real trader. The certificate carries its
              Karat, tier, period and trade count — never money, never R.
            </p>
          </div>
        ) : null}
        {resolved.wrappedHref !== null ? (
          <Link href={resolved.wrappedHref} className="w-fit text-[11px] font-medium uppercase tracking-[2px] text-gold hover:text-gold-light">
            See the month’s Wrapped →
          </Link>
        ) : (
          <p className="text-sm leading-relaxed text-text-2">
            Issued by Kavrix from the trader&rsquo;s own MetaTrader 5 history. The certificate carries its Karat, tier, period
            and trade count — never money, never R, never the account.
          </p>
        )}
      </div>
      <div className="w-full max-w-[520px]">
        <CertificateCard data={data} alt={resolved.alt} idPrefix={`verify-${data.serial}`} />
      </div>
    </main>
  );
}
