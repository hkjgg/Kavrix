import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { Scene, SectionHeading } from '@/components/ui';
import { beatStyle } from '@/components/viz/instrument';
import { formatMoney, formatR } from '@/lib/format';
import type { AssayResult } from '@/lib/engine';
import { ExplainButton } from './ExplainButton';
import { GapCard, type GapScopeView } from './GapCard';
import { EXPLAIN_IDS, historyPeriodLabel } from './explain';

/**
 * `03 — The Gap` (CLAUDE.md §6.3, §6.10, §8.5) — what indiscipline cost, told
 * twice, the way the engine keeps it:
 *
 *  1. **As a curve.** Two bullion bars — the account as it finished, and the
 *     same account with every impurity trade removed (winners too) — with the
 *     difference engraved between them. The counterfactual bar is the 24K
 *     one: bright, pure metal. The actual bar is the alloy. Always labelled
 *     "Counterfactual, not a promise" (§6.10).
 *  2. **As a bill.** The Karat Gap: losses only, each trade billed once, to
 *     one pillar, broken down beneath. The two do not match, and are not
 *     meant to: the bars remove winners too, the bill counts only losses.
 *
 * Nothing here is set larger than the Karat — the Gap is a consequence of the
 * score, not the headline of the page.
 */

function gapScopes(assay: AssayResult): GapScopeView[] {
  const windowCaption = `${assay.karat.windowStart.slice(0, 10)} → ${assay.karat.windowEnd.slice(0, 10)}`;
  const first = assay.trades[0];
  const allCaption =
    first === undefined
      ? windowCaption
      : `${first.openTime.slice(0, 10)} → ${assay.asOf.slice(0, 10)}`;

  return [
    {
      key: 'window',
      toggleLabel: '30-day window',
      caption: windowCaption,
      totalMoney: assay.gap.totalCostMoney,
      totalR: assay.gap.totalCostR,
      currency: assay.gap.currency,
      impurityCount: assay.gap.impurityCount,
      tradeCount: assay.gap.tradeCount,
      explainId: EXPLAIN_IDS.gapTotal('window'),
      lines: assay.gap.lines.map((line) => ({
        pillar: line.pillar,
        label: line.label,
        costMoney: line.costMoney,
        costR: line.costR,
        tradeCount: line.tradeCount,
        explainId: EXPLAIN_IDS.gapLine('window', line.pillar),
      })),
    },
    {
      key: 'all',
      toggleLabel: '90-day total',
      caption: allCaption,
      totalMoney: assay.gapAllTime.totalCostMoney,
      totalR: assay.gapAllTime.totalCostR,
      currency: assay.gapAllTime.currency,
      impurityCount: assay.gapAllTime.impurityCount,
      tradeCount: assay.gapAllTime.tradeCount,
      explainId: EXPLAIN_IDS.gapTotal('all'),
      lines: assay.gapAllTime.lines.map((line) => ({
        pillar: line.pillar,
        label: line.label,
        costMoney: line.costMoney,
        costR: line.costR,
        tradeCount: line.tradeCount,
        explainId: EXPLAIN_IDS.gapLine('all', line.pillar),
      })),
    },
  ];
}

/* -------------------------------------------------------------------------
 * Bullion bars
 * ---------------------------------------------------------------------- */

/** The shortest a bar is drawn, as a share of the longest — a sliver reads as a mistake. */
const MIN_BAR_SHARE = 0.2;
const BAR_WIDTH = 400;
const BAR_HEIGHT = 96;

interface IngotProps {
  id: string;
  /** Share of the longest bar, 0–1. */
  share: number;
  /** `pure` is the 24K bar; `alloy` the actual result. */
  metal: 'pure' | 'alloy';
  /** Drawn hollow when the value is below zero: there is no metal to show. */
  hollow: boolean;
}

/**
 * One ingot, front-on: a narrow top face catching the light, a tapered front
 * face shaded top to bottom. Length is proportional to the value.
 */
function Ingot({ id, share, metal, hollow }: IngotProps) {
  const length = Math.max(share, MIN_BAR_SHARE) * BAR_WIDTH;
  const top = `${14} 8, ${length - 14} 8, ${length - 6} 28, ${6} 28`;
  const front = `${6} 28, ${length - 6} 28, ${length} ${BAR_HEIGHT - 4}, 0 ${BAR_HEIGHT - 4}`;
  const pure = metal === 'pure';

  if (hollow) {
    return (
      <svg viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`} className="block w-full" aria-hidden="true">
        <polygon points={top} fill="none" stroke="var(--text-3)" strokeWidth={1} strokeDasharray="4 4" />
        <polygon points={front} fill="none" stroke="var(--text-3)" strokeWidth={1} strokeDasharray="4 4" />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`} className="block w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-top`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--gold-light)" stopOpacity={pure ? 1 : 0.55} />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity={pure ? 1 : 0.55} />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={pure ? 'var(--gold)' : 'var(--gold-deep)'} />
          <stop offset="55%" stopColor="var(--gold-deep)" stopOpacity={pure ? 1 : 0.75} />
          <stop offset="100%" stopColor="var(--gold-deep)" stopOpacity={pure ? 0.7 : 0.45} />
        </linearGradient>
        <linearGradient id={`${id}-glint`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--gold-light)" stopOpacity={0} />
          <stop offset="30%" stopColor="var(--gold-light)" stopOpacity={pure ? 0.5 : 0.18} />
          <stop offset="60%" stopColor="var(--gold-light)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Shadow on the shelf. */}
      <ellipse
        cx={length / 2}
        cy={BAR_HEIGHT - 3}
        rx={length / 2}
        ry={3}
        fill="#000000"
        fillOpacity={0.6}
      />
      <polygon points={front} fill={`url(#${id}-front)`} />
      <polygon points={top} fill={`url(#${id}-top)`} />
      {/* The edge where the faces meet catches the light. */}
      <line x1={6} y1={28} x2={length - 6} y2={28} stroke="var(--gold-light)" strokeOpacity={pure ? 0.8 : 0.35} strokeWidth={0.8} />
      <polygon points={front} fill={`url(#${id}-glint)`} />
    </svg>
  );
}

interface BarColumnProps {
  id: string;
  label: string;
  money: number;
  r: number;
  currency: string;
  share: number;
  metal: 'pure' | 'alloy';
  delay: number;
}

function BarColumn({ id, label, money, r, currency, share, metal, delay }: BarColumnProps) {
  return (
    <div
      className="enter-rise flex flex-col gap-4"
      style={beatStyle({ delay, duration: 700 }) as CSSProperties}
    >
      <span className="text-[11px] font-medium uppercase tracking-[3px] text-text-3">{label}</span>
      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            'font-serif text-3xl leading-none sm:text-4xl',
            money >= 0 ? 'text-jade' : 'text-oxblood-text',
          )}
        >
          {formatMoney(money, { currency, signed: true })}
        </span>
        <span className="font-mono text-xs text-text-3">{formatR(r)}</span>
      </div>
      <div
        className="enter-wipe"
        style={beatStyle({ delay: delay + 250, duration: 900 }) as CSSProperties}
      >
        <Ingot id={id} share={share} metal={metal} hollow={money < 0} />
      </div>
    </div>
  );
}

export function GapScene({ assay }: { assay: AssayResult }) {
  const whatIf = assay.counterfactual;
  const all = whatIf.scenarios.find((scenario) => scenario.key === 'all');
  const currency = whatIf.currency;

  const longest =
    all === undefined
      ? Math.abs(whatIf.actualEndMoney)
      : Math.max(Math.abs(whatIf.actualEndMoney), Math.abs(all.endMoney));
  const share = (value: number): number => (longest > 0 ? Math.abs(value) / longest : 0);

  return (
    <Scene aria-labelledby="scene-gap">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <SectionHeading id="scene-gap" index="03" title="The Gap" />
        <p className="max-w-md text-sm text-text-3 lg:text-right">
          What indiscipline cost — as a curve, and as a bill.
        </p>
      </div>

      {all !== undefined ? (
        <div className="mt-12 lg:mt-16">
          <div className="grid grid-cols-1 items-end gap-10 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-8 lg:gap-14">
            <BarColumn
              id="kavrix-ingot-actual"
              label="Actual result"
              money={whatIf.actualEndMoney}
              r={whatIf.actualEndR}
              currency={currency}
              share={share(whatIf.actualEndMoney)}
              metal="alloy"
              delay={0}
            />

            {/* The difference, engraved between the two bars. */}
            <div
              className="enter-fade flex flex-col items-center gap-2 md:pb-6"
              style={beatStyle({ delay: 900, duration: 600 }) as CSSProperties}
            >
              <span aria-hidden="true" className="hidden h-10 w-px bg-gold/25 md:block" />
              <div className="engraved flex flex-col items-center gap-1.5 rounded-2xl bg-bg px-6 py-4 text-center">
                <span className="text-[10px] font-medium uppercase tracking-[3px] text-text-3">
                  Difference
                </span>
                <ExplainButton
                  explainId={EXPLAIN_IDS.whatIf}
                  label={`Every impurity removed: ${formatMoney(all.deltaMoney, {
                    currency,
                    signed: true,
                  })} against the actual result`}
                  bare
                >
                  <span
                    className={cn(
                      'font-serif text-2xl leading-none sm:text-3xl',
                      all.deltaMoney >= 0 ? 'text-jade' : 'text-oxblood-text',
                    )}
                  >
                    {formatMoney(all.deltaMoney, { currency, signed: true })}
                  </span>
                </ExplainButton>
                <span className="font-mono text-[11px] text-text-3">{formatR(all.deltaR)}</span>
              </div>
              <span aria-hidden="true" className="hidden h-10 w-px bg-gold/25 md:block" />
            </div>

            <BarColumn
              id="kavrix-ingot-pure"
              label="Every impurity removed"
              money={all.endMoney}
              r={all.endR}
              currency={currency}
              share={share(all.endMoney)}
              metal="pure"
              delay={180}
            />
          </div>

          <div
            className="enter-fade mt-8 flex flex-col gap-3 border-t border-line pt-6 lg:flex-row lg:items-start lg:gap-10"
            style={beatStyle({ delay: 1200, duration: 600 }) as CSSProperties}
          >
            <span className="engraved inline-flex shrink-0 items-center self-start rounded-full px-3 py-1.5 text-[10px] font-medium uppercase leading-none tracking-[2px] text-gold">
              {whatIf.label}
            </span>
            <p className="text-xs leading-relaxed text-text-3">
              Whole account, EAs included · {historyPeriodLabel(assay)} ·{' '}
              {all.removedTradeCount} impurity trades removed, {all.removedWins} of them
              winners. {whatIf.method}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className="enter-rise mt-16 lg:mt-20"
        style={beatStyle({ delay: 1400, duration: 700 }) as CSSProperties}
      >
        <GapCard scopes={gapScopes(assay)} countDelayMs={1400} />
      </div>
    </Scene>
  );
}
