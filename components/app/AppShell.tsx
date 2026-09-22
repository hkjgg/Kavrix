import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { PrimaryNav } from './PrimaryNav';

/**
 * The application shell: wordmark, navigation, whose account this is, and the
 * "Demo data" badge that never leaves the header (CLAUDE.md §2, §11).
 *
 * The header is true obsidian, not a translucent panel: a blurred overlay over
 * a warm-black page reads grey, and §9 is specific about the surface values.
 */

export interface AppShellProps {
  /** e.g. `XAUUSD · Demo`. */
  accountLabel: string;
  /** e.g. `Last 30 days`. */
  periodLabel: string;
  demo?: boolean;
  children: ReactNode;
}

export function AppShell({
  accountLabel,
  periodLabel,
  demo = false,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <div className="flex h-16 items-center gap-6">
            <Link
              href="/demo"
              className="sheen shrink-0 font-serif text-xl leading-none tracking-[0.42em] lg:text-2xl"
              aria-label="Kavrix — the Assay"
            >
              KAVRIX
            </Link>

            <PrimaryNav className="hidden lg:block" />

            <div className="ml-auto flex items-center gap-5">
              <div className="hidden text-right sm:block">
                <span className="block text-[10px] font-medium uppercase leading-none tracking-[2px] text-text-3">
                  Account
                </span>
                <span className="mt-1.5 block font-mono text-xs text-text-2">
                  {accountLabel}
                </span>
              </div>
              <div className="hidden text-right md:block">
                <span className="block text-[10px] font-medium uppercase leading-none tracking-[2px] text-text-3">
                  Period
                </span>
                <span className="mt-1.5 block font-mono text-xs text-text-2">
                  {periodLabel}
                </span>
              </div>
              {demo ? <Badge tone="gold">Demo data</Badge> : null}
            </div>
          </div>

          <PrimaryNav className="-mx-4 overflow-x-auto px-4 pb-3 lg:hidden" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-10 sm:px-6 lg:px-10 lg:pt-14">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6 lg:px-10">
          <span className="font-mono text-[11px] text-text-3">
            Kavrix · Gold trading intelligence
          </span>
          <span className="font-mono text-[11px] text-text-3">
            {demo ? 'Demo data · deterministic seed · read-only' : accountLabel}
          </span>
        </div>
      </footer>
    </div>
  );
}
