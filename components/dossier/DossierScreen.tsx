import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Badge, Card, Label, SectionHeading } from '@/components/ui';
import { Hallmark } from '@/components/viz/Hallmark';
import type { ExplainTone } from '@/components/assay/explain-types';
import type { DossierNav, DossierView } from './dossier';
import { PriceChart } from './PriceChart';

/**
 * The Trade Dossier (CLAUDE.md §4) — one trade, in the Assay's section rhythm:
 * its Hallmark and figures, `01` the market around it, `02` what its
 * impurities cost, `03` the trades that looked like it.
 *
 * A server component rendering a `DossierView` of pre-formatted strings; the
 * chart is the only client code on the page.
 */

const TONE: Record<ExplainTone, string> = {
  gold: 'text-gold',
  loss: 'text-oxblood-text',
  profit: 'text-jade',
  neutral: 'text-text',
};

function NavBar({ nav, position }: { nav: DossierNav; position: 'top' | 'bottom' }) {
  const linkClass =
    'group flex min-w-0 flex-col gap-1 rounded-card border border-line px-4 py-3 transition-colors hover:border-gold/40 hover:bg-surface-2';
  return (
    <nav
      aria-label={position === 'top' ? 'Dossier navigation' : 'Dossier navigation, end of page'}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={nav.back}
          prefetch={false}
          className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[2px] text-text-3 transition-colors hover:text-gold"
        >
          <span aria-hidden="true">←</span> The Ledger
        </Link>
        <span className="font-mono text-[11px] text-text-3">{nav.position}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {nav.previous !== null ? (
          <Link href={nav.previous.href} prefetch={false} rel="prev" className={linkClass}>
            <span className="text-[10px] font-medium uppercase tracking-[2px] text-text-3 group-hover:text-gold">
              ↑ Previous
            </span>
            <span className="truncate font-mono text-xs text-text-2">
              {nav.previous.label} · {nav.previous.time}
            </span>
          </Link>
        ) : (
          <span className={cn(linkClass, 'pointer-events-none opacity-40')} aria-disabled="true">
            <span className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">↑ Previous</span>
            <span className="font-mono text-xs text-text-3">First in the filter</span>
          </span>
        )}
        {nav.next !== null ? (
          <Link href={nav.next.href} prefetch={false} rel="next" className={cn(linkClass, 'items-end text-right')}>
            <span className="text-[10px] font-medium uppercase tracking-[2px] text-text-3 group-hover:text-gold">
              Next ↓
            </span>
            <span className="truncate font-mono text-xs text-text-2">
              {nav.next.label} · {nav.next.time}
            </span>
          </Link>
        ) : (
          <span className={cn(linkClass, 'pointer-events-none items-end text-right opacity-40')} aria-disabled="true">
            <span className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Next ↓</span>
            <span className="font-mono text-xs text-text-3">Last in the filter</span>
          </span>
        )}
      </div>
      {nav.note !== null && position === 'top' ? (
        <p className="text-[11px] text-text-3">{nav.note}</p>
      ) : null}
    </nav>
  );
}

export function DossierScreen({ view }: { view: DossierView }) {
  return (
    <div className="flex flex-col gap-16 lg:gap-20">
      <NavBar nav={view.nav} position="top" />

      {/* — Header: the Hallmark, the figures, the impurity badges — */}
      <header className="flex flex-col gap-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <Hallmark input={view.hallmark} size={112} />
          <div className="flex min-w-0 flex-col gap-3">
            <Label>{view.eyebrow}</Label>
            <h1 className="font-serif text-4xl font-normal leading-none text-text sm:text-5xl">{view.title}</h1>
            <p className="font-mono text-xs text-text-2">{view.subtitle}</p>
            <p className="font-mono text-xs text-text-3">{view.when}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {view.badges.length === 0 ? (
                <Badge tone="gold">Clean</Badge>
              ) : (
                view.badges.map((badge) => (
                  <Badge key={badge.label} tone={badge.tone}>
                    {badge.label}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-4">
          {view.figures.map((figure) => (
            <div key={figure.label} className="flex flex-col gap-2 bg-surface-1 px-5 py-5">
              <dt className="text-[11px] font-medium uppercase tracking-[2px] text-text-3">{figure.label}</dt>
              <dd className={cn('font-mono text-lg tabular-nums leading-tight', TONE[figure.tone])}>
                {figure.value}
              </dd>
              {figure.caption !== null ? (
                <dd className="text-[11px] leading-snug text-text-3">{figure.caption}</dd>
              ) : null}
            </div>
          ))}
        </dl>

        {view.scopeNote !== null ? (
          <p className="max-w-3xl border-l border-gold/40 pl-4 text-xs leading-relaxed text-text-2">
            {view.scopeNote}
          </p>
        ) : null}
      </header>

      {/* — 01 The chart — */}
      <section aria-labelledby="dossier-chart" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <SectionHeading id="dossier-chart" index="01" title="The market around it" />
          {view.chart !== null ? (
            <p className="font-mono text-[11px] text-text-3">
              {view.chart.timeframe} · demo price path · UTC
            </p>
          ) : null}
        </div>
        {view.chart === null ? (
          <Card>
            <p className="text-sm text-text-3">No price bars for this trade.</p>
          </Card>
        ) : (
          <>
            <PriceChart chart={view.chart} />
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-text-3" aria-label="Chart legend">
              <li className="flex items-center gap-2"><span className="h-px w-4 bg-gold" />Entry</li>
              <li className="flex items-center gap-2"><span className="h-px w-4 border-t border-dashed border-champagne" />Exit</li>
              <li className="flex items-center gap-2"><span className="h-px w-4 bg-text-2" />Initial SL</li>
              <li className="flex items-center gap-2"><span className="h-px w-4 border-t border-dotted border-slate" />SL modification</li>
              <li className="flex items-center gap-2"><span className="h-px w-4 border-t border-dotted border-jade" />MFE</li>
              <li className="flex items-center gap-2"><span className="h-px w-4 border-t border-dotted border-oxblood-text" />MAE</li>
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-slate/40" />Asia</li>
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-gold/25" />London</li>
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-bronze/35" />New York</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-px bg-news" />High-impact USD release</li>
            </ul>
          </>
        )}
      </section>

      {/* — 02 Impurities — */}
      <section aria-labelledby="dossier-impurities" className="flex flex-col gap-6">
        <SectionHeading
          id="dossier-impurities"
          index="02"
          title="What it cost"
          subtitle="Each flagged reason: the rule it broke, the pillar that deducts for it, and what the Karat Gap billed."
        />
        {view.impurities.length === 0 ? (
          <Card>
            <p className="text-sm text-text-2">
              No impurity. The trade kept every rule the Karat scores — whatever it made or lost, the
              process was clean.
            </p>
          </Card>
        ) : (
          <ol className="grid gap-4 lg:grid-cols-2">
            {view.impurities.map((impurity) => (
              <li key={impurity.kind}>
                <Card className="flex h-full flex-col gap-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-serif text-2xl font-normal text-text">{impurity.label}</h3>
                    {impurity.cost !== null ? (
                      <span className="shrink-0 font-mono text-sm tabular-nums text-oxblood-text">{impurity.cost}</span>
                    ) : (
                      <span className="shrink-0 font-mono text-[11px] text-text-3">not billed</span>
                    )}
                  </div>
                  <dl className="flex flex-col gap-3 text-xs leading-relaxed">
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Rule</dt>
                      <dd className="mt-1 text-text-2">{impurity.rule}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">This trade</dt>
                      <dd className="mt-1 font-mono text-text">{impurity.fact}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Pillar</dt>
                      <dd className="mt-1 text-text-2">{impurity.pillar}</dd>
                    </div>
                    <div className="border-t border-line pt-3">
                      <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Karat Gap</dt>
                      <dd className={cn('mt-1', impurity.billed ? 'text-text' : 'text-text-3')}>{impurity.billing}</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* — 03 Similar trades — */}
      <section aria-labelledby="dossier-similar" className="flex flex-col gap-6">
        <SectionHeading
          id="dossier-similar"
          index="03"
          title="Similar trades"
          subtitle="The twelve nearest earlier trades, on what was known at entry only: hour, weekday, session, news, the previous result, risk, direction and volatility."
        />

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="flex flex-col gap-3">
            <p className="text-[15px] leading-relaxed text-text">{view.similar.headline}</p>
            <p className="font-mono text-xs text-text-2">{view.similar.record}</p>
            <p className="border-l border-gold/40 pl-4 text-xs leading-relaxed text-text-2">
              {view.similar.hindsightLine}
            </p>
          </Card>
          {view.similar.confidence !== null ? (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Confidence</Label>
                <span className="engraved inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-[2px] text-gold">
                  {view.similar.confidence.label}
                  {view.similar.tentative ? ' · tentative' : ''}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 font-mono text-xs text-text-2">
                <span>{view.similar.confidence.sample}</span>
                <span>{view.similar.confidence.interval}</span>
                <span>{view.similar.confidence.winRate}</span>
                <span>{view.similar.confidence.pValue}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-text-3">{view.similar.confidence.meaning}</p>
            </Card>
          ) : null}
        </div>

        {view.similar.neighbours.length > 0 ? (
          <Card flush className="overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <caption className="sr-only">
                  The {view.similar.neighbours.length} most similar earlier trades, nearest first.
                </caption>
                <thead className="border-b border-line">
                  <tr>
                    {['Hallmark', 'Time (UTC)', 'Dir', 'R', 'P&L', 'Impurities', 'Nearest on'].map((header) => (
                      <th
                        key={header}
                        scope="col"
                        className={cn(
                          'px-4 py-3 text-[11px] font-medium uppercase tracking-[2px] text-text-3 whitespace-nowrap',
                          header === 'R' || header === 'P&L' ? 'text-right' : 'text-left',
                        )}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.similar.neighbours.map((neighbour) => (
                    <tr key={neighbour.id} className="border-b border-line last:border-b-0 transition-colors hover:bg-surface-2">
                      <td className="px-4 py-2.5">
                        <Hallmark input={neighbour.hallmark} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Link href={neighbour.href} prefetch={false} className="font-mono text-[13px] text-text hover:text-gold">
                          {neighbour.time}
                        </Link>
                        <span className="mt-1 block font-mono text-[11px] text-text-3">{neighbour.id}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[2px] text-text-2">
                        {neighbour.direction}
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-mono tabular-nums', TONE[neighbour.rTone])}>
                        {neighbour.r}
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-mono tabular-nums', TONE[neighbour.pnlTone])}>
                        {neighbour.pnl}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-3">{neighbour.impurities}</td>
                      <td className="px-4 py-2.5 text-xs text-text-3">{neighbour.matchedOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </section>

      <NavBar nav={view.nav} position="bottom" />
    </div>
  );
}
