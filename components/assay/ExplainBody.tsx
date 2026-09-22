import { cn } from '@/lib/cn';
import { Label } from '@/components/ui';
import type { ExplainEntry, ExplainTone } from './explain-types';

const TONE_CLASS: Record<ExplainTone, string> = {
  gold: 'text-gold',
  loss: 'text-oxblood-text',
  profit: 'text-jade',
  neutral: 'text-text',
};

/**
 * The content of one explanation: the figure, what it is, its formula, the
 * breakdown, the trades behind it and its §6.6 confidence.
 *
 * Shared by the Explain drawer and by the Assay Instrument's in-place pillar
 * detail (Stage 3.5) — two presentations of the same information, so the
 * words and the numbers can never drift apart between them.
 */
export function ExplainBody({ entry }: { entry: ExplainEntry }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span
          className={cn(
            'font-serif text-5xl leading-none',
            TONE_CLASS[entry.valueTone],
          )}
        >
          {entry.value}
        </span>
        {entry.valueCaption !== null ? (
          <span className="font-mono text-xs text-text-3">{entry.valueCaption}</span>
        ) : null}
      </div>

      <p className="mt-6 text-sm leading-relaxed text-text-2">{entry.definition}</p>

      {entry.scopeNote !== null ? (
        <p className="mt-4 border-l border-gold/40 pl-4 text-xs leading-relaxed text-text-2">
          {entry.scopeNote}
        </p>
      ) : null}

      <section className="mt-6">
        <Label>Formula</Label>
        <p className="mt-3 rounded-xl border border-line bg-bg px-4 py-3 font-mono text-xs leading-relaxed text-text-2">
          {entry.formula}
        </p>
        <p className="mt-2 text-[11px] tracking-[1px] text-text-3">{entry.source}</p>
      </section>

      {entry.lines.length > 0 ? (
        <section className="mt-7">
          <Label>{entry.linesTitle ?? 'Breakdown'}</Label>
          <dl className="mt-3 flex flex-col">
            {entry.lines.map((line) => (
              <div
                key={`${line.label}-${line.value}`}
                className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
              >
                <dt className="text-sm text-text-2">{line.label}</dt>
                <dd
                  className={cn(
                    'shrink-0 font-mono text-sm tabular-nums',
                    TONE_CLASS[line.tone ?? 'neutral'],
                  )}
                >
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {entry.rows.length > 0 ? (
        <section className="mt-7">
          <Label>{entry.rowsTitle ?? 'The trades behind it'}</Label>
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th
                  scope="col"
                  className="py-2 text-left text-[11px] uppercase tracking-[2px] text-text-3"
                >
                  Time
                </th>
                <th
                  scope="col"
                  className="py-2 pl-3 text-right text-[11px] uppercase tracking-[2px] text-text-3"
                >
                  R
                </th>
                <th
                  scope="col"
                  className="py-2 pl-4 text-left text-[11px] uppercase tracking-[2px] text-text-3"
                >
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.rows.map((row) => (
                <tr key={row.tradeId} className="border-b border-line last:border-b-0">
                  <td className="py-2 font-mono text-xs whitespace-nowrap text-text-2">
                    {row.time}
                  </td>
                  <td
                    className={cn(
                      'py-2 pl-3 text-right font-mono text-xs tabular-nums whitespace-nowrap',
                      TONE_CLASS[row.tone],
                    )}
                  >
                    {row.r}
                  </td>
                  <td className="py-2 pl-4 text-xs text-text-3">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entry.rowsNote !== null ? (
            <p className="mt-3 text-[11px] text-text-3">{entry.rowsNote}</p>
          ) : null}
        </section>
      ) : null}

      {entry.confidence !== null ? (
        <section className="mt-7">
          <Label>Confidence</Label>
          <div className="mt-3 rounded-xl border border-line bg-bg px-4 py-4">
            <span className="inline-flex items-center rounded-full border border-gold/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[2px] text-gold">
              {entry.confidence.label}
            </span>
            <dl className="mt-3 flex flex-col gap-1.5 font-mono text-xs text-text-2">
              <div>{entry.confidence.sample}</div>
              <div>{entry.confidence.interval}</div>
              <div>{entry.confidence.winRate}</div>
              <div>{entry.confidence.pValue}</div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-text-3">
              {entry.confidence.meaning}
            </p>
          </div>
        </section>
      ) : null}

      {entry.note !== null ? (
        <p className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-text-3">
          {entry.note}
        </p>
      ) : null}
    </>
  );
}
