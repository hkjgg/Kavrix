import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui';
import { WrappedChapter } from './WrappedChapters';
import { WrappedStory } from './WrappedStory';
import type { WrappedView } from './wrapped';

/**
 * `/wrapped` — a month of discipline, told in chapters (CLAUDE.md §4, §17
 * Stage 7). One of the four places cinematic motion is allowed (§2): the page
 * leaves the application shell for a dark stage, keeps only the wordmark, the
 * months, the permanent "Demo data" badge and a way out.
 */

const EXIT_HREF = '/demo';

function MonthNav({ view, className }: { view: WrappedView; className?: string }) {
  return (
    <nav aria-label="Months" className={cn('overflow-x-auto', className)}>
      <ul className="flex items-center gap-1">
        {view.months.map((month) => (
          <li key={month.month}>
            <Link
              href={month.href}
              aria-current={month.current ? 'page' : undefined}
              title={month.partial ? `${month.label}, month to date` : month.label}
              className={cn(
                'block whitespace-nowrap rounded-full px-2.5 py-1.5 font-mono text-[11px] transition-colors sm:px-3',
                month.current ? 'bg-surface-2 text-gold' : 'text-text-3 hover:bg-surface-2 hover:text-text',
              )}
            >
              {month.short}
              {month.partial ? <span className="text-text-3"> · MTD</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function WrappedPage({ view, demo }: { view: WrappedView; demo: boolean }) {
  const chapters = view.chapters.map((chapter) => ({
    id: `chapter-${chapter.kind}`,
    number: chapter.number,
    title: chapter.title,
    headingId: `wrapped-${chapter.kind}-heading`,
  }));

  return (
    <div className="wrapped flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-4 px-4 sm:gap-6 sm:px-8">
          <Link href="/demo" className="sheen shrink-0 font-serif text-xl leading-none tracking-[0.42em]" aria-label="Kavrix — the Assay">
            KAVRIX
          </Link>
          <h1 className="hidden text-[11px] font-medium uppercase tracking-[3px] text-text-3 md:block">
            Wrapped · <span className="text-text-2">{view.label}</span>
            {view.partial ? <span className="text-text-3"> · month to date</span> : null}
          </h1>

          <MonthNav view={view} className="ml-auto hidden min-w-0 md:block" />
          {demo ? (
            <span className="hidden shrink-0 md:block">
              <Badge tone="gold">Demo data</Badge>
            </span>
          ) : null}
          <span className="ml-auto md:hidden" />
          <Link
            href={EXIT_HREF}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-text-2 transition-colors hover:border-gold hover:text-gold"
            data-wrapped-exit=""
            aria-label="Leave Wrapped (Esc)"
            title="Leave Wrapped (Esc)"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
        {/* Phones: the months and the badge get their own row, current month first in view. */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 md:hidden">
          <MonthNav view={view} className="min-w-0 flex-1" />
          {demo ? <span className="shrink-0 text-[10px] font-medium uppercase tracking-[2px] text-gold">Demo data</span> : null}
        </div>
      </header>

      {view.state === 'assaying' || view.chapters.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
          <h2 className="font-serif text-5xl text-text">
            <span className="assaying">Assaying…</span>
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-text-2">
            {view.label} holds {view.tradeCount} manual {view.tradeCount === 1 ? 'trade' : 'trades'}. A month is assayed from{' '}
            {view.minimumTrades}, so there is no story to tell yet.
          </p>
          <Link href={EXIT_HREF} className="text-[11px] font-medium uppercase tracking-[2px] text-gold hover:text-gold-light">
            Back to the Assay
          </Link>
        </main>
      ) : (
        <main className="flex flex-1 flex-col">
          {/* Without script nothing can turn the page, so every chapter shows, in order.
              `@media (scripting: none)` in globals.css says the same for browsers that
              report it; this covers the ones that only honour <noscript>. */}
          <noscript
            dangerouslySetInnerHTML={{
              __html:
                '<style>.wrapped-chapter[data-inactive]{display:flex}.wrapped-chapter+.wrapped-chapter{border-top:1px solid var(--line)}.wrapped-controls,.wrapped-progress{display:none}</style>',
            }}
          />
          <p className="sr-only">
            {view.label}, {view.periodText}. {view.chapters.length} chapters.
          </p>
          <WrappedStory chapters={chapters} exitHref={EXIT_HREF}>
            {view.chapters.map((chapter, index) => (
              <div key={chapter.kind} className="mx-auto flex w-full max-w-[1280px] flex-1 items-center px-4 py-12 sm:px-8 lg:py-16">
                <WrappedChapter
                  chapter={chapter}
                  headingId={chapters[index]?.headingId ?? `wrapped-${chapter.kind}-heading`}
                  month={view.month}
                  href={view.href}
                />
              </div>
            ))}
          </WrappedStory>
        </main>
      )}
    </div>
  );
}
