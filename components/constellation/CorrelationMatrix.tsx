import { cn } from '@/lib/cn';
import type { MatrixView } from './constellation';

/**
 * The correlation matrix (Stage 6): the same pairs as the sky, as a grid, for
 * readers who would rather read one. Gold intensity is the correlation — a
 * negative one draws no gold, exactly as it draws no thread — and a same-bet
 * cell carries the double hairline.
 *
 * Fixed square cells. With many EAs the grid scrolls sideways inside its own
 * container, the names column held in place; the page itself never does.
 */
export function CorrelationMatrix({
  matrix,
  minOverlapDays,
}: {
  matrix: MatrixView;
  minOverlapDays: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto overscroll-x-contain rounded-card border border-line bg-surface-1">
        <table className="border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            Pearson correlation of daily P&amp;L between every pair of EAs, over the days both traded.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[168px] bg-surface-1 px-4 py-3 text-[10px] font-medium uppercase tracking-[2px] text-text-3"
              >
                EA
              </th>
              {matrix.columns.map((column) => (
                <th
                  key={column.magic}
                  scope="col"
                  title={column.name}
                  className="w-14 min-w-14 px-0 py-3 text-center font-mono text-[11px] font-normal text-text-3"
                >
                  {column.magic}
                </th>
              ))}
              <td aria-hidden="true" className="w-4" />
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.magic}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[168px] border-t border-line bg-surface-1 px-4 py-0 text-sm font-normal text-text"
                >
                  <span className="block truncate">{row.name}</span>
                  <span className="block font-mono text-[10px] text-text-3">{row.magic}</span>
                </th>
                {row.cells.map((cell) => (
                  <td key={cell.magic} className="border-t border-line p-1">
                    <span
                      title={cell.ariaLabel}
                      className={cn(
                        'relative grid size-12 place-items-center rounded-[6px] font-mono text-[11px]',
                        cell.self
                          ? 'bg-surface-2/60'
                          : cell.intensity > 0
                            ? 'text-text'
                            : cell.enoughOverlap
                              ? 'text-text-3'
                              : 'text-text-3/70',
                        cell.sameBet ? 'ring-1 ring-gold/60 ring-offset-2 ring-offset-surface-1' : '',
                      )}
                      style={
                        cell.self || cell.intensity <= 0
                          ? undefined
                          : { backgroundColor: `color-mix(in srgb, var(--gold) ${Math.round(cell.intensity * 45)}%, transparent)` }
                      }
                    >
                      {cell.self ? (
                        <span aria-hidden="true" className="h-px w-4 bg-text-3/40" />
                      ) : (
                        <span aria-hidden="true">{cell.text}</span>
                      )}
                      <span className="sr-only">{cell.ariaLabel}</span>
                    </span>
                  </td>
                ))}
                <td aria-hidden="true" className="w-4 border-t border-line" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-text-3">
        Gold intensity is the correlation; a negative correlation draws none. A ringed cell is a same bet.
        · marks a pair with fewer than {minOverlapDays} shared trading days: not enough overlap to claim a number.
      </p>
    </div>
  );
}
