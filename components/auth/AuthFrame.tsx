import type { ReactNode } from 'react';
import Link from 'next/link';

/** The frame around sign-in and sign-up: the wordmark, one card, the way to the demo. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-10 px-4 py-14">
      <div className="flex flex-col gap-5">
        <Link href="/demo" className="sheen w-fit font-serif text-2xl leading-none tracking-[0.42em]" aria-label="Kavrix — the demo">
          KAVRIX
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-4xl font-normal text-text">{title}</h1>
          <p className="text-sm leading-relaxed text-text-2">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-8 rounded-card border border-line bg-surface-1 p-6 sm:p-8">{children}</div>
      <div className="flex flex-col gap-2 text-sm text-text-2">{footer}</div>
    </main>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-4" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[10px] uppercase tracking-[3px] text-text-3">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function NotConfigured() {
  return (
    <p className="text-sm leading-relaxed text-text-2">
      Accounts are not configured on this deployment. The{' '}
      <Link href="/demo" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
        demo
      </Link>{' '}
      is open to everyone.
    </p>
  );
}
