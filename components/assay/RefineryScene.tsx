import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { Scene, SectionHeading } from '@/components/ui';
import { beatStyle } from '@/components/viz/instrument';
import { formatMoney, formatR } from '@/lib/format';
import type { AssayResult } from '@/lib/engine';
import { CONFIDENCE_LABELS } from '@/lib/engine/confidence';
import { ExplainButton } from './ExplainButton';
import { EXPLAIN_IDS, findingPeriodLabel } from './explain';

/**
 * `02 — The Refinery` (CLAUDE.md §10) — the three findings worth acting on,
 * numbered the way a certificate numbers its clauses.
 *
 * Only Strong and Moderate findings reach it (§6.6), each carrying its
 * confidence and **its own period** — a finding measured over 90 days,
 * unweighted, sits on the same page as pillars scored over 30 days with a
 * recency weight, and the reader must be able to tell which is which.
 *
 * The scene is set on a slightly warmer surface than the rest of the page.
 * The findings arrive one after another: each numeral is engraved first, then
 * the sentence, then the figures.
 */

const NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;

/** The gap between one finding's arrival and the next. */
const FINDING_STAGGER_MS = 650;

export function RefineryScene({ assay }: { assay: AssayResult }) {
  const currency = assay.account.currency;
  const findings = assay.refinery;

  return (
    <Scene aria-labelledby="scene-refinery">
      <div
        className="rounded-[28px] border border-gold/10 px-5 py-12 sm:px-10 lg:px-14 lg:py-16"
        style={{ backgroundColor: 'color-mix(in srgb, var(--gold) 4%, var(--surface-1))' }}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <SectionHeading id="scene-refinery" index="02" title="The Refinery" />
          <p className="text-[11px] tracking-[1px] text-text-3">
            Ranked by money at stake · Strong or Moderate evidence only
          </p>
        </div>

        {findings.length === 0 ? (
          <p className="mt-10 text-sm text-text-2">
            Nothing has enough evidence behind it to lead yet. The findings stay in the
            data until they do.
          </p>
        ) : (
          <ol className="mt-12 grid gap-14 lg:mt-16 lg:grid-cols-3 lg:gap-12">
            {findings.map((finding, index) => {
              const positive = finding.impactMoney >= 0;
              const base = index * FINDING_STAGGER_MS;
              const numeral = NUMERALS[index] ?? String(index + 1);

              return (
                <li key={finding.id} className="flex flex-col gap-5 lg:border-l lg:border-gold/10 lg:pl-8 lg:first:border-l-0 lg:first:pl-0">
                  <div className="flex items-end justify-between gap-3">
                    <svg
                      viewBox="0 0 150 84"
                      className="h-[64px] w-auto overflow-visible lg:h-[76px]"
                      aria-hidden="true"
                    >
                      <text
                        x="1"
                        y="74"
                        fontSize="92"
                        fill="var(--gold)"
                        stroke="var(--gold)"
                        strokeWidth={0.7}
                        className="enter-engrave font-serif"
                        style={
                          {
                            '--dash': 420,
                            ...beatStyle({ delay: base, duration: 900 }),
                          } as CSSProperties
                        }
                      >
                        {numeral}
                      </text>
                    </svg>

                    <span
                      className="enter-fade"
                      style={beatStyle({ delay: base + 500, duration: 500 }) as CSSProperties}
                    >
                      {finding.confidence !== null ? (
                        <span className="engraved inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-[2px] text-gold">
                          {CONFIDENCE_LABELS[finding.confidence.label]}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-line px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-[2px] text-text-3">
                          No mean to test
                        </span>
                      )}
                    </span>
                  </div>

                  <div
                    className="enter-rise"
                    style={beatStyle({ delay: base + 400, duration: 700 }) as CSSProperties}
                  >
                    <ExplainButton
                      explainId={EXPLAIN_IDS.finding(finding.id)}
                      label={finding.headline}
                      bare
                      className="block"
                    >
                      <span className="block text-[15px] leading-relaxed text-text">
                        {finding.headline}
                      </span>
                    </ExplainButton>
                  </div>

                  <div
                    className="enter-fade mt-auto flex flex-col gap-2 border-t border-gold/10 pt-4"
                    style={beatStyle({ delay: base + 750, duration: 600 }) as CSSProperties}
                  >
                    <div className="flex items-baseline gap-3">
                      <span
                        className={cn(
                          'font-mono text-sm tabular-nums',
                          positive ? 'text-jade' : 'text-oxblood-text',
                        )}
                      >
                        {formatMoney(finding.impactMoney, { currency, signed: true })}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-text-3">
                        {formatR(finding.impactR)}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-text-3">
                        {finding.tradeIds.length} trades
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-text-3">
                      {findingPeriodLabel(finding, assay)} · unweighted
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Scene>
  );
}
