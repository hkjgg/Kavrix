import type { ConstellationView } from './constellation';
import { ConstellationScreen } from './ConstellationScreen';
import { CorrelationMatrix } from './CorrelationMatrix';

/**
 * Everything under the Constellation's heading: the summary row, the sky and
 * its panel, the matrix — or, with no EA trades at all, a short explanation
 * and no stars. An empty sky is not drawn with placeholder stars.
 */
export function ConstellationBody({ view }: { view: ConstellationView }) {
  return (
    <>
    {view.empty ? (
      <div className="flex max-w-xl flex-col gap-3 rounded-card border border-line bg-surface-1 p-6">
        <span className="text-[11px] font-medium uppercase tracking-[3px] text-text-3">No EA trades yet</span>
        <p className="font-serif text-xl leading-snug text-text-2">
          The Constellation draws one star for each Expert Advisor.
        </p>
        <p className="text-sm leading-relaxed text-text-2">
          EA trades are grouped by their magic number — the id MT5 stamps on every order an EA places.
          Manual trades carry magic 0 and stay in the Assay. Once trades with a magic number arrive,
          each EA is assayed here: its Fineness, its drift and the EAs it moves with.
        </p>
      </div>
    ) : (
      <>
        <dl
          aria-label="Summary"
          className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 md:grid-cols-4"
        >
          {view.summary.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-1.5">
              <dt className="text-[11px] font-medium uppercase tracking-[2px] text-text-3">{item.label}</dt>
              <dd className="m-0 flex flex-col gap-1">
                <span className="font-serif text-3xl leading-none text-text">{item.value}</span>
                <span className="truncate text-xs text-text-3">{item.note}</span>
              </dd>
            </div>
          ))}
        </dl>

        <ConstellationScreen view={view} />

        <section aria-labelledby="matrix-heading" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h2 id="matrix-heading" className="font-serif text-2xl text-text">
              Correlation matrix
            </h2>
            <p className="max-w-prose text-sm text-text-2">
              The same pairs as the sky, as a grid: Pearson correlation of daily P&amp;L, over the days both
              EAs traded.
            </p>
          </div>
          <CorrelationMatrix matrix={view.matrix} minOverlapDays={view.minOverlapDays} />
        </section>
      </>
    )}
    </>
  );
}
