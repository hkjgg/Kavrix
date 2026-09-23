import { Fragment, type CSSProperties, type Ref } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Label, Scene } from '@/components/ui';
import { beatStyle } from '@/components/viz/instrument';
import type { ImpurityKind } from '@/lib/engine/enrich';
import { formatKarat, formatMoney, formatR } from '@/lib/format';
import { longDate } from '@/lib/dates';
import { IMPURITY_LABELS } from '@/lib/ledger/labels';
import type { ReplayDayView, ReplayRowView, TiltSpan, VaultDay } from './vault';
import { karatX, replaySegment } from './vault';

/**
 * The Discipline Replay (CLAUDE.md §6.11) — one day, trade by trade.
 *
 * A vertical timeline: each entry is a trade in the order it was opened, with
 * its time, its R, the engine's reason for every impurity it carried, and the
 * day Karat once it was counted. Beside the entries runs the day Karat
 * itself, as a line — 24K at the right edge of its lane, 0K at the left — so
 * a collapse is seen as a fall across the lane, not read off a column of
 * figures. Tilt episodes (the engine's ≥ 2 impurities inside 60 minutes) are
 * bracketed, with their start, end, Karat drop and cost.
 *
 * The entrance draws the timeline top to bottom and then marks the tilt
 * spans. It is the scene system's (`enter-*`), so under reduced motion, or
 * before any script, the day is simply there.
 */

/** Tier boundaries drawn as faint guides down the Karat lane (§6.2). */
const LANE_GUIDES = [14, 18, 22] as const;

const ROW_GRID =
  'grid grid-cols-[10px_38px_64px_minmax(0,1fr)] gap-x-2.5 sm:grid-cols-[12px_44px_96px_minmax(0,1fr)] sm:gap-x-3.5';

/** How long the timeline takes to draw: longer days take a little longer, never long. */
export function replayDrawDuration(rowCount: number): number {
  return Math.min(Math.max(500 + rowCount * 140, 700), 1800);
}

function toneClass(value: number): string {
  if (value > 0) return 'text-jade';
  if (value < 0) return 'text-oxblood-text';
  return 'text-text-2';
}

/** Where a row sits in a bracket: the bracket's open, middle or close. */
type BracketPart = 'open' | 'middle' | 'close' | null;

function Bracket({ part, delay }: { part: BracketPart; delay: number }) {
  if (part === null) return <span aria-hidden="true" />;
  return (
    <span aria-hidden="true" className="relative block">
      <span
        className={cn(
          'enter-fade absolute inset-y-0 left-0.5 right-0 border-l border-gold-deep',
          part === 'open' && 'top-2 rounded-tl-md border-t',
          part === 'close' && 'bottom-2 rounded-bl-md border-b',
        )}
        style={beatStyle({ delay, duration: 500 }) as CSSProperties}
      />
    </span>
  );
}

/** One row's stretch of the running-Karat line. */
function Lane({
  before,
  after,
  dot,
  reach = 'full',
}: {
  before: number;
  after: number;
  /** A mark where the line lands: filled for a clean trade, hollow for an impure one. */
  dot?: 'clean' | 'impure' | 'end';
  /** The first row starts the line at its middle, the last row ends it there. */
  reach?: 'full' | 'from-middle' | 'to-middle';
}) {
  const xb = karatX(before);
  const xa = karatX(after);
  let d = replaySegment(before, after);
  if (reach === 'from-middle') d = `M${xa} 50 L${xa} 100`;
  if (reach === 'to-middle') d = `M${xb} 0 L${xb} 22 L${xa} 50`;

  return (
    <span aria-hidden="true" className="relative block min-h-12">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        {LANE_GUIDES.map((karat) => (
          <line
            key={karat}
            x1={karatX(karat)}
            x2={karatX(karat)}
            y1={0}
            y2={100}
            stroke="var(--line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={d}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {dot !== undefined ? (
        <span
          className={cn(
            'absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full',
            dot === 'clean' && 'bg-gold',
            dot === 'impure' && 'border-[1.5px] border-gold bg-bg',
            dot === 'end' && 'bg-gold-light shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_25%,transparent)]',
          )}
          style={{ left: `${xa}%` }}
        />
      ) : null}
    </span>
  );
}

function bracketPart(index: number, spans: readonly TiltSpan[], header: boolean): BracketPart {
  for (const span of spans) {
    if (index < span.startIndex || index > span.endIndex) continue;
    if (header) return 'open';
    if (index === span.endIndex) return 'close';
    return 'middle';
  }
  return null;
}

function SpanHeader({
  span,
  currency,
  delay,
}: {
  span: TiltSpan;
  currency: string;
  delay: number;
}) {
  const badge = span.worstOverall ? 'Worst in the history' : span.worstOfDay ? 'Worst of the day' : null;
  return (
    <li className={ROW_GRID} data-tilt-span={`${span.startIndex}-${span.endIndex}`}>
      <Bracket part="open" delay={delay} />
      <span className="pt-3 font-mono text-[11px] text-text-3">{span.start}</span>
      <Lane before={span.karatBefore} after={span.karatBefore} />
      <div
        className="enter-fade flex flex-col gap-1.5 py-2.5"
        style={beatStyle({ delay, duration: 500 }) as CSSProperties}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[2px] text-gold">
            Tilt episode
          </span>
          {badge !== null ? (
            <span className="engraved rounded-full px-2 py-0.5 text-[9px] font-medium uppercase leading-none tracking-[1.5px] text-gold-light">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-text-2">
          {span.start}–{span.end} UTC · {Math.round(span.durationMinutes)} min ·{' '}
          {span.impurityTradeCount} impurities
        </p>
        <p className="font-mono text-[11px] leading-relaxed text-text-2">
          {formatKarat(span.karatBefore)} → {formatKarat(span.karatAfter)}{' '}
          <span className="text-text">({formatKarat(-span.karatDrop, { signed: true })})</span> ·
          cost{' '}
          <span className={span.costMoney > 0 ? 'text-oxblood-text' : 'text-text-2'}>
            {formatMoney(-span.costMoney, { currency, signed: true })}
          </span>{' '}
          · {formatR(-span.costR)}
        </p>
      </div>
    </li>
  );
}

function TradeRow({
  row,
  part,
  bracketDelay,
  currency,
  reasons,
}: {
  row: ReplayRowView;
  part: BracketPart;
  bracketDelay: number;
  currency: string;
  reasons: Partial<Record<ImpurityKind, string>>;
}) {
  const impure = row.impurities.length > 0;
  return (
    <li className={ROW_GRID} data-trade-id={row.id}>
      <Bracket part={part} delay={bracketDelay} />
      <span className="pt-3 font-mono text-xs text-text-2">{row.time}</span>
      <Lane before={row.karatBefore} after={row.karatAfter} dot={impure ? 'impure' : 'clean'} />
      <div className="flex min-w-0 flex-col gap-1.5 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Link
            href={`/trade/${row.id}`}
            prefetch={false}
            className="font-mono text-xs text-text underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
          >
            {row.id}
            <span className="sr-only">, open its Trade Dossier</span>
          </Link>
          <span className="font-mono text-xs">
            <span className={toneClass(row.rMultiple)}>{formatR(row.rMultiple)}</span>
            <span className="text-text-3"> · </span>
            <span className={toneClass(row.netProfit)}>
              {formatMoney(row.netProfit, { currency, signed: true })}
            </span>
          </span>
        </div>

        {impure ? (
          <ul className="flex flex-col gap-1">
            {row.impurities.map((kind) => (
              <li key={kind} className="flex gap-2 text-[11px] leading-snug text-text-2">
                <span aria-hidden="true" className="mt-[5px] size-[5px] shrink-0 rotate-45 border border-gold" />
                <span>
                  <span className="text-text">{IMPURITY_LABELS[kind]}</span>
                  {reasons[kind] !== undefined ? (
                    <span className="text-text-3"> — {reasons[kind]}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-text-3">Clean — no impurity</p>
        )}

        <p className="font-mono text-[11px] text-text-3">
          Day Karat after{' '}
          <span className="text-text">{formatKarat(row.karatAfter)}</span>
          {row.karatChange !== 0 ? (
            <span> ({formatKarat(row.karatChange, { signed: true })})</span>
          ) : null}
          {row.billedTo !== null ? (
            <span>
              {' '}
              · billed to {row.billedTo}{' '}
              <span className="text-oxblood-text">
                {formatMoney(-row.costMoney, { currency, signed: true })}
              </span>
            </span>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export interface ReplayProps {
  date: string;
  /** `null` when the day holds no manual trade. */
  day: ReplayDayView | null;
  /** The calendar's own record of the day, for the empty state. */
  vaultDay: VaultDay | null;
  currency: string;
  reasons: Partial<Record<ImpurityKind, string>>;
  onClose?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function Replay({ date, day, vaultDay, currency, reasons, onClose, headingRef }: ReplayProps) {
  const rows = day?.rows ?? [];
  const spans = day?.spans ?? [];
  const drawMs = replayDrawDuration(rows.length + spans.length + 2);
  const bracketDelay = 120 + drawMs;
  const spanAt = new Map(spans.map((span) => [span.startIndex, span]));

  return (
    <Scene
      id="vault-replay"
      aria-labelledby="vault-replay-title"
      className="rounded-card border border-line bg-surface-1 p-5 sm:p-6"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Label>Discipline Replay</Label>
          <h2
            id="vault-replay-title"
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-2xl leading-tight text-text focus:outline-none sm:text-3xl"
          >
            {longDate(date)}
          </h2>
        </div>
        {onClose !== undefined ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the replay"
            className="-mr-1 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </header>

      {day === null || rows.length === 0 ? (
        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6">
          <p className="text-sm leading-relaxed text-text-2">
            {vaultDay !== null && vaultDay.tradeCount > 0
              ? `No manual trades on this day — ${vaultDay.tradeCount} EA ${
                  vaultDay.tradeCount === 1 ? 'trade' : 'trades'
                } ran, and EA trades are outside the day Karat.`
              : 'No trades on this day.'}
          </p>
          <p className="text-xs text-text-3">
            A day with no trades has nothing to fault, so there is nothing to replay.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Day Karat</dt>
              <dd className="font-serif text-2xl leading-none text-gold">{formatKarat(day.karat)}</dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Trades</dt>
              <dd className="font-mono text-sm text-text">
                {day.tradeCount}
                <span className="text-text-3"> · {day.impurityTradeCount} impure</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Net</dt>
              <dd className="font-mono text-sm">
                <span className={toneClass(day.netMoney)}>
                  {formatMoney(day.netMoney, { currency, signed: true })}
                </span>
                <span className="block text-[11px] text-text-3">{formatR(day.netR)}</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Tilt</dt>
              <dd className="font-mono text-sm text-text">
                {spans.length === 0 ? 'None' : `${spans.length} ${spans.length === 1 ? 'episode' : 'episodes'}`}
              </dd>
            </div>
          </dl>

          {/* The Karat lane's scale, over the lane column. */}
          <div aria-hidden="true" className={cn(ROW_GRID, 'mt-7')}>
            <span />
            <span />
            <span className="flex justify-between font-mono text-[9px] text-text-3">
              <span>0K</span>
              <span>24K</span>
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">
              Trades in order · UTC
            </span>
          </div>

          <ol
            aria-label={`Trades on ${longDate(date)}, in the order they were opened`}
            className="enter-drop mt-1"
            style={beatStyle({ delay: 120, duration: drawMs }) as CSSProperties}
          >
            <li className={ROW_GRID}>
              <span aria-hidden="true" />
              <span className="pt-3 font-mono text-[11px] text-text-3">Open</span>
              <Lane before={24} after={24} reach="from-middle" />
              <p className="py-3 font-mono text-[11px] text-text-3">
                The day opens at {formatKarat(24)} — nothing to fault yet.
              </p>
            </li>

            {rows.map((row, index) => {
              const span = spanAt.get(index);
              return (
                <Fragment key={row.id}>
                  {span !== undefined ? (
                    <SpanHeader span={span} currency={currency} delay={bracketDelay} />
                  ) : null}
                  <TradeRow
                    row={row}
                    part={bracketPart(index, spans, false)}
                    bracketDelay={bracketDelay}
                    currency={currency}
                    reasons={reasons}
                  />
                </Fragment>
              );
            })}

            <li className={ROW_GRID}>
              <span aria-hidden="true" />
              <span className="pt-3 font-mono text-[11px] text-text-3">Close</span>
              <Lane before={day.karat} after={day.karat} dot="end" reach="to-middle" />
              <p className="py-3 font-mono text-[11px] text-text-3">
                The day closes at <span className="text-gold">{formatKarat(day.karat)}</span>.
              </p>
            </li>
          </ol>

          <p className="mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-text-3">
            The day Karat is this day&rsquo;s own manual trades, unweighted — a mark on a day, not
            the score. A tilt episode is two or more impurities, each within 60 minutes of the last.
            {day.eaTradeCount > 0
              ? ` ${day.eaTradeCount} EA ${day.eaTradeCount === 1 ? 'trade' : 'trades'} also ran that day; EA trades are outside the day Karat and are not replayed.`
              : ''}
          </p>
        </>
      )}
    </Scene>
  );
}
