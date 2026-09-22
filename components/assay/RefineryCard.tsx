import { cn } from '@/lib/cn';
import { Card, Label } from '@/components/ui';
import { formatMoney, formatR } from '@/lib/format';
import type { AssayResult } from '@/lib/engine';
import { CONFIDENCE_LABELS } from '@/lib/engine/confidence';
import { ExplainButton } from './ExplainButton';
import { EXPLAIN_IDS } from './explain';

/**
 * The Refinery (CLAUDE.md §10) — the three findings worth acting on, numbered
 * the way a certificate numbers its clauses.
 *
 * Only Strong and Moderate findings reach this card (§6.6); each one carries
 * its confidence as a small engraved badge, so the reader can see how much
 * weight the claim has before acting on it.
 */

const NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;

export function RefineryCard({ assay }: { assay: AssayResult }) {
  const currency = assay.account.currency;
  const findings = assay.refinery;

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <Label>The Refinery</Label>
        <span className="text-[11px] tracking-[1px] text-text-3">
          Ranked by money at stake
        </span>
      </div>

      {findings.length === 0 ? (
        <p className="text-sm text-text-2">
          Nothing has enough evidence behind it to lead yet. The findings stay in the
          data until they do.
        </p>
      ) : (
        <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-3">
          {findings.map((finding, index) => {
            const positive = finding.impactMoney >= 0;
            return (
              <li
                key={finding.id}
                className="flex flex-col gap-4 bg-surface-1 p-5 transition-colors hover:bg-surface-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className="font-serif text-2xl leading-none text-gold"
                  >
                    {NUMERALS[index] ?? String(index + 1)}
                  </span>
                  {finding.confidence !== null ? (
                    <span className="engraved inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-[2px] text-gold">
                      {CONFIDENCE_LABELS[finding.confidence.label]}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-line px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-[2px] text-text-3">
                      No mean to test
                    </span>
                  )}
                </div>

                <ExplainButton
                  explainId={EXPLAIN_IDS.finding(finding.id)}
                  label={finding.headline}
                  bare
                  className="block"
                >
                  <span className="block text-sm leading-relaxed text-text">
                    {finding.headline}
                  </span>
                </ExplainButton>

                <div className="mt-auto flex items-baseline gap-3 pt-1">
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
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
