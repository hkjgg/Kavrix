import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { CountUp } from '@/components/ui/CountUp';
import { AssayDial } from '@/components/viz/AssayDial';
import { STAR_STYLES } from '@/components/viz/constellation';
import { certificateHref } from '@/components/viz/certificate';
import { CertificateActions } from './CertificateActions';
import { CertificateCard } from './CertificateCard';
import type {
  CertificateChapterView,
  DayChapterView,
  EasChapterView,
  GapChapterView,
  KaratChapterView,
  ProofChapterView,
  PurityChapterView,
  WindowChapterView,
  WrappedChapterView,
} from './wrapped';

/**
 * The chapters of Wrapped (CLAUDE.md §17 Stage 7), one idea each.
 *
 * Server components: every figure arrives formatted or laid out from
 * `wrapped.ts`, and nothing is computed here (§16). Each chapter reveals with
 * a short sequence — the `enter-*` classes, played when the chapter is shown
 * (display: none cancels a CSS animation, so showing one starts it again) —
 * and nothing loops. Without JavaScript, or under reduced motion, no
 * animation exists and every chapter is simply there.
 */

function beat(delay: number, duration?: number): CSSProperties {
  return { ['--d' as string]: `${delay}ms`, ...(duration === undefined ? {} : { ['--t' as string]: `${duration}ms` }) };
}

/** The editorial head every chapter shares: `03 — Your best window`, the idea, its sentences. */
function ChapterText({
  chapter,
  headingId,
  children,
  className,
}: {
  chapter: WrappedChapterView;
  headingId: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex max-w-[34rem] flex-col', className)}>
      <p className="enter-fade text-[11px] font-medium uppercase tracking-[3px] text-text-3" style={beat(0)}>
        {chapter.number} — {chapter.title}
      </p>
      <h2
        id={headingId}
        tabIndex={-1}
        className="enter-rise mt-5 font-serif text-[2.4rem] leading-[1.05] text-text outline-none sm:text-5xl lg:text-[3.6rem]"
        style={beat(120, 900)}
      >
        {chapter.headline}
      </h2>
      <div className="mt-6 flex flex-col gap-3">
        {chapter.sentences.map((sentence, index) => (
          <p
            key={sentence}
            className="enter-rise text-[15px] leading-relaxed text-text-2 sm:text-base"
            style={beat(420 + index * 160, 800)}
          >
            {sentence}
          </p>
        ))}
      </div>
      {children}
    </div>
  );
}

/* 01 — The month's Karat ------------------------------------------------- */

function KaratChapter({ chapter, headingId }: { chapter: KaratChapterView; headingId: string }) {
  return (
    <div className="grid w-full items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
      <ChapterText chapter={chapter} headingId={headingId}>
        <ul aria-label="The six pillars, this month" className="mt-10 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {chapter.pillars.map((pillar, index) => (
            <li key={pillar.key} className="enter-fade flex flex-col gap-1.5" style={beat(900 + index * 60)}>
              <span className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">{pillar.label}</span>
              <span className="font-mono text-xs text-text-2">{pillar.value}</span>
              <span aria-hidden="true" className="relative block h-px w-full bg-line">
                <span
                  className="enter-wipe absolute inset-y-0 left-0 block bg-gold"
                  style={{ width: `${pillar.share * 100}%`, height: 1, ...beat(1000 + index * 60, 900) }}
                />
              </span>
            </li>
          ))}
        </ul>
      </ChapterText>
      <div className="mx-auto w-full max-w-[460px]">
        <AssayDial
          karat={chapter.karat}
          tierLabel={chapter.tier}
          deltaKarat={chapter.delta}
          deltaSuffix={chapter.deltaSuffix}
          noDeltaText={chapter.noDeltaText}
          tradeCount={chapter.tradeCount}
          minimumTrades={10}
          periodLabel={chapter.dialCaption}
        />
      </div>
    </div>
  );
}

/* 02 — The purity of the month ------------------------------------------- */

function PurityChapter({ chapter, headingId, month }: { chapter: PurityChapterView; headingId: string; month: string }) {
  const gradientId = `wrapped-purity-${month}`;
  return (
    <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:items-center lg:gap-14">
      <ChapterText chapter={chapter} headingId={headingId} />
      <figure className="flex flex-col gap-3">
        <div className="relative w-full" style={{ aspectRatio: `${chapter.width + 70} / ${chapter.height + 40}` }}>
          <svg
            viewBox={`-60 -10 ${chapter.width + 70} ${chapter.height + 40}`}
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2={chapter.width} y2="0" gradientUnits="userSpaceOnUse">
                {chapter.stops.map((stop) => (
                  <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                ))}
              </linearGradient>
            </defs>
            {chapter.yTicks.map((tick) => (
              <g key={tick.y}>
                <line x1={0} x2={chapter.width} y1={tick.y} y2={tick.y} stroke="var(--line)" strokeWidth={1} />
                <text x={-12} y={tick.y + 5} textAnchor="end" className="fill-text-3 font-mono" fontSize={17}>
                  {tick.label}
                </text>
              </g>
            ))}
            {chapter.xTicks.map((tick) => (
              <text key={tick.x} x={tick.x} y={chapter.height + 28} textAnchor="middle" className="fill-text-3 font-mono" fontSize={17}>
                {tick.label}
              </text>
            ))}
            {chapter.marks.map((mark) => (
              <g key={mark.tone} className="enter-fade" style={beat(1900)}>
                <line
                  x1={mark.x}
                  x2={mark.x}
                  y1={0}
                  y2={chapter.height}
                  stroke={mark.tone === 'bright' ? 'var(--gold-light)' : 'var(--slate)'}
                  strokeOpacity={0.45}
                  strokeDasharray="2 5"
                />
                <text
                  x={mark.x}
                  y={-2}
                  textAnchor={mark.x > chapter.width * 0.85 ? 'end' : mark.x < chapter.width * 0.15 ? 'start' : 'middle'}
                  fontSize={16}
                  className={cn('font-mono', mark.tone === 'bright' ? 'fill-gold-light' : 'fill-text-3')}
                >
                  {mark.label}
                </text>
              </g>
            ))}
            <path
              d={chapter.d}
              pathLength={1}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="enter-draw"
              style={beat(500, 1800)}
            />
            {chapter.stamps.map((stamp, index) => (
              <rect
                key={`${stamp.x}-${index}`}
                x={stamp.x - 3}
                y={stamp.y - 3}
                width={6}
                height={6}
                transform={`rotate(45 ${stamp.x} ${stamp.y})`}
                fill="var(--bg)"
                stroke="var(--slate)"
                strokeWidth={1.2}
                className="enter-fade"
                style={beat(2100)}
              />
            ))}
          </svg>
        </div>
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-[11px] text-text-3">
          <span className="font-mono">
            {chapter.startLabel} → {chapter.endLabel} ·{' '}
            <CountUp
              value={chapter.netMoney}
              kind="money"
              digits={0}
              signed
              currency={chapter.currency}
              delayMs={600}
              durationMs={1600}
              className={chapter.netMoney >= 0 ? 'text-jade' : 'text-oxblood-text'}
            />
          </span>
          <span className="max-w-[40rem] leading-relaxed">{chapter.scopeNote} Diamonds mark impure trades.</span>
        </figcaption>
      </figure>
    </div>
  );
}

/* 03 — Your best window --------------------------------------------------- */

function WindowChapter({ chapter, headingId }: { chapter: WindowChapterView; headingId: string }) {
  return (
    <div className="flex w-full flex-col gap-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <ChapterText chapter={chapter} headingId={headingId} />
        <dl className="grid grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-4 lg:grid-cols-2">
          <div className="enter-rise col-span-2 flex flex-col gap-1 sm:col-span-4 lg:col-span-2" style={beat(600)}>
            <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">In the window</dt>
            <dd className="font-serif text-6xl leading-none text-gold sm:text-7xl">
              <CountUp value={chapter.netR} kind="r" delayMs={700} durationMs={1400} />
            </dd>
          </div>
          {chapter.figures.map((figure, index) => (
            <div key={figure.label} className="enter-fade flex flex-col gap-1" style={beat(900 + index * 80)}>
              <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">{figure.label}</dt>
              <dd className="font-mono text-sm text-text">{figure.value}</dd>
            </div>
          ))}
          <div className="enter-fade col-span-2 flex flex-col gap-1 sm:col-span-4 lg:col-span-2" style={beat(1300)}>
            <dt className="text-[10px] font-medium uppercase tracking-[2px] text-text-3">Confidence</dt>
            <dd className="font-mono text-sm text-text-2">{chapter.confidence}</dd>
          </div>
        </dl>
      </div>
      <figure className="flex flex-col gap-3">
        <div className="relative w-full" style={{ aspectRatio: `${chapter.width + 60} / ${chapter.height + 30}` }}>
          <svg
            viewBox={`-50 0 ${chapter.width + 60} ${chapter.height + 30}`}
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            {chapter.sessions.map((session, index) => (
              <g key={session.key}>
                <rect x={session.x} y={4 + index * 7} width={session.width} height={3} rx={1.5} fill={session.color} opacity={0.7} />
              </g>
            ))}
            <rect
              x={chapter.window.x}
              y={26}
              width={chapter.window.width}
              height={chapter.height - 50}
              fill="var(--gold)"
              fillOpacity={0.07}
              stroke="var(--gold)"
              strokeOpacity={0.55}
              strokeWidth={1}
              className="enter-fade"
              style={beat(400, 900)}
            />
            {chapter.rTicks.map((tick) => (
              <g key={tick.label}>
                <line
                  x1={0}
                  x2={chapter.width}
                  y1={tick.y}
                  y2={tick.y}
                  stroke={tick.y === chapter.zeroY ? 'var(--text-3)' : 'var(--line)'}
                  strokeOpacity={tick.y === chapter.zeroY ? 0.5 : 1}
                  strokeDasharray={tick.y === chapter.zeroY ? '4 5' : undefined}
                />
                <text x={-10} y={tick.y + 5} textAnchor="end" fontSize={16} className="fill-text-3 font-mono">
                  {tick.label}
                </text>
              </g>
            ))}
            {chapter.dots.map((dot, index) => {
              const color = dot.tone === 'profit' ? 'var(--jade)' : dot.tone === 'loss' ? 'var(--oxblood)' : 'var(--text-3)';
              return (
                <circle
                  key={index}
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.inWindow ? 4.2 : 3.2}
                  fill={dot.impure ? 'var(--bg)' : color}
                  stroke={color}
                  strokeWidth={1.3}
                  opacity={dot.inWindow ? 1 : 0.4}
                  className="enter-fade"
                  style={beat(700 + Math.round(dot.x / 2), 500)}
                />
              );
            })}
            {chapter.hourTicks.map((tick) => (
              <text key={tick.label + tick.x} x={tick.x} y={chapter.height + 20} textAnchor="middle" fontSize={16} className="fill-text-3 font-mono">
                {tick.label}
              </text>
            ))}
          </svg>
        </div>
        <figcaption className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-text-3">
          <span>Every manual trade of the month by its entry hour (UTC) and its R. Hollow marks carried an impurity.</span>
          {chapter.sessions.map((session) => (
            <span key={session.key} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="block h-[3px] w-5 rounded-full" style={{ backgroundColor: session.color }} />
              {session.label}
            </span>
          ))}
        </figcaption>
      </figure>
    </div>
  );
}

/* 04 — What impurity cost ------------------------------------------------- */

function GapChapter({ chapter, headingId }: { chapter: GapChapterView; headingId: string }) {
  return (
    <div className="flex w-full flex-col gap-12">
      <ChapterText chapter={chapter} headingId={headingId} />
      <div className="flex flex-col gap-6">
        <div className="enter-rise flex flex-wrap items-baseline gap-x-6 gap-y-2" style={beat(500)}>
          <span className="font-serif text-6xl leading-none text-oxblood-text sm:text-7xl">
            <CountUp value={-chapter.totalMoney} kind="money" currency={chapter.currency} delayMs={600} durationMs={1600} />
          </span>
          <span className="font-mono text-lg text-text-3">
            <CountUp value={-chapter.totalR} kind="r" delayMs={600} durationMs={1600} />
          </span>
        </div>
        {/* A bullion bar, split by pillar: the ingot's sloped sides, oxblood shaded by rank. */}
        <div
          role="img"
          aria-label={`The Karat Gap by pillar: ${chapter.segments.map((segment) => `${segment.label} ${segment.money}`).join(', ')}.`}
          className="enter-wipe flex h-16 w-full overflow-hidden sm:h-20"
          style={{ clipPath: 'polygon(2.5% 0, 97.5% 0, 100% 100%, 0 100%)', ...beat(900, 1400) }}
        >
          {chapter.segments.map((segment) => (
            <span
              key={segment.pillar}
              className="relative block h-full border-r border-bg last:border-r-0"
              style={{
                width: `${segment.share * 100}%`,
                background: `linear-gradient(180deg, color-mix(in srgb, var(--oxblood) ${Math.round(segment.shade * 100)}%, var(--bg)) 0%, color-mix(in srgb, var(--oxblood) ${Math.round(segment.shade * 70)}%, var(--bg)) 100%)`,
              }}
            />
          ))}
        </div>
        <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {chapter.segments.map((segment, index) => (
            <li key={segment.pillar} className="enter-fade flex flex-col gap-1.5" style={beat(1700 + index * 90)}>
              <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[2px] text-text-3">
                <span
                  aria-hidden="true"
                  className="block h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: `color-mix(in srgb, var(--oxblood) ${Math.round(segment.shade * 100)}%, var(--bg))` }}
                />
                {segment.label}
              </span>
              <span className="font-mono text-sm text-text">{segment.money}</span>
              <span className="font-mono text-[11px] text-text-3">
                {segment.r} · {segment.trades}
              </span>
            </li>
          ))}
        </ul>
        <p className="enter-fade max-w-[46rem] text-[11px] leading-relaxed text-text-3" style={beat(2100)}>
          {chapter.note}
        </p>
      </div>
    </div>
  );
}

/* 05 — The day that defined the month ------------------------------------ */

function DayChapter({ chapter, headingId }: { chapter: DayChapterView; headingId: string }) {
  const bottom = chapter.height - 30;
  return (
    <div className="grid w-full gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
      <ChapterText chapter={chapter} headingId={headingId}>
        <Link
          href={chapter.vaultHref}
          className="enter-fade mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-line px-4 py-2 text-[11px] font-medium uppercase tracking-[2px] text-text-2 transition-colors hover:border-gold hover:text-gold"
          style={beat(1100)}
        >
          Open {chapter.dateLabel.split(' ').slice(1, 3).join(' ')} in the Vault
          <span aria-hidden="true">→</span>
        </Link>
      </ChapterText>
      <figure className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] font-medium uppercase tracking-[2px] text-text-3">{chapter.dateLabel}</span>
          <span className="font-mono text-xs text-text-2">
            Closed at <span className="text-gold">{chapter.karatLabel}</span> · {chapter.tierLabel}
          </span>
        </div>
        <div className="relative w-full" style={{ aspectRatio: `${chapter.width} / ${chapter.height}` }}>
          <svg viewBox={`0 0 ${chapter.width} ${chapter.height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
            {chapter.tilt !== null ? (
              <rect
                x={chapter.tilt.x}
                y={14}
                width={chapter.tilt.width}
                height={bottom - 14}
                rx={4}
                fill="none"
                stroke="var(--news)"
                strokeOpacity={0.6}
                strokeDasharray="3 4"
                className="enter-fade"
                style={beat(1500)}
              />
            ) : null}
            {chapter.bands.map((band) => (
              <rect key={band.x} x={band.x} y={22} width={band.width} height={bottom - 22} fill="var(--slate)" fillOpacity={0.14} />
            ))}
            {chapter.gridlines.map((line) => (
              <g key={line.label}>
                <line x1={58} x2={chapter.width - 40} y1={line.y} y2={line.y} stroke="var(--line)" strokeDasharray={line.label === '24K' ? undefined : '2 4'} />
                <text x={48} y={line.y + 5} textAnchor="end" fontSize={14} className="fill-text-3 font-mono">
                  {line.label}
                </text>
              </g>
            ))}
            {chapter.news.map((event) => (
              <line key={event.label} x1={event.x} x2={event.x} y1={16} y2={bottom} stroke="var(--news)" strokeOpacity={0.7} strokeDasharray="3 4" />
            ))}
            {chapter.breaks.map((x) => (
              <text key={x} x={x} y={bottom + 4} textAnchor="middle" fontSize={12} className="fill-text-3">
                ⋯
              </text>
            ))}
            {chapter.karatPaths.map((path, index) => (
              <path
                key={index}
                d={path.d}
                pathLength={1}
                fill="none"
                stroke={path.impure ? 'color-mix(in srgb, var(--gold-deep) 55%, var(--slate))' : 'var(--gold)'}
                strokeWidth={2.2}
                className="enter-draw"
                style={beat(500 + index * 90, 500)}
              />
            ))}
            {chapter.entries.map((entry, index) => (
              <line
                key={index}
                x1={entry.x}
                x2={entry.x}
                y1={bottom - 6}
                y2={bottom}
                stroke={entry.impure ? 'var(--slate)' : 'var(--gold)'}
                strokeWidth={1.5}
              />
            ))}
            {chapter.timeTicks.map((tick) => (
              <text key={tick.x} x={tick.x} y={chapter.height - 6} textAnchor="middle" fontSize={14} className="fill-text-3 font-mono">
                {tick.label}
              </text>
            ))}
          </svg>
        </div>
        <ol className="flex flex-col gap-4 border-t border-line pt-5">
          {chapter.chapters.map((entry, index) => (
            <li key={`${entry.title}-${entry.range}`} className="enter-fade grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4" style={beat(1300 + index * 120)}>
              <span className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium uppercase tracking-[2px] text-text-2">{entry.title}</span>
                <span className="font-mono text-[11px] text-text-3">{entry.range}</span>
              </span>
              <span className="text-sm leading-relaxed text-text-2">{entry.sentence}</span>
            </li>
          ))}
        </ol>
        <figcaption className="text-[11px] text-text-3">
          The running day Karat, trade by trade: gold where the trade was clean, tarnished where it was not
          {chapter.tilt !== null ? '; the dashed frame is the tilt' : ''}. Amber rules are high-impact USD releases.
        </figcaption>
      </figure>
    </div>
  );
}

/* 06 — Your proof ---------------------------------------------------------- */

function ProofChapter({ chapter, headingId }: { chapter: ProofChapterView; headingId: string }) {
  const bars = [
    { key: 'high', bar: chapter.high },
    { key: 'low', bar: chapter.low },
  ] as const;
  return (
    <div className="grid w-full gap-12 lg:grid-cols-2 lg:items-center">
      <ChapterText chapter={chapter} headingId={headingId}>
        <p className="enter-fade mt-8 max-w-[30rem] text-[11px] leading-relaxed text-text-3" style={beat(1000)}>
          {chapter.scopeNote}
        </p>
      </ChapterText>
      <div className="flex flex-col gap-10">
        <p className="enter-fade text-[11px] font-medium uppercase tracking-[3px] text-text-3" style={beat(500)}>
          Average R a week, by the week’s Karat
        </p>
        {bars.map(({ key, bar }, index) => (
          <div key={key} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-text-2">
                {bar.label} · {bar.weeks}
              </span>
              <span className={cn('font-mono text-sm', bar.value >= 0 ? 'text-jade' : 'text-oxblood-text')}>{bar.text} a week</span>
            </div>
            <div className="relative h-2.5 w-full rounded-full bg-surface-2">
              <span aria-hidden="true" className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-line" />
              <span
                className="enter-wipe absolute inset-y-0 block rounded-full"
                style={{
                  width: `${bar.share * 50}%`,
                  left: bar.value >= 0 ? '50%' : `${50 - bar.share * 50}%`,
                  backgroundColor: bar.value >= 0 ? 'var(--jade)' : 'var(--oxblood)',
                  ...beat(900 + index * 200, 1000),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 07 — Your EAs ------------------------------------------------------------ */

function EasChapter({ chapter, headingId }: { chapter: EasChapterView; headingId: string }) {
  return (
    <div className="grid w-full gap-12 lg:grid-cols-2 lg:items-center">
      <ChapterText chapter={chapter} headingId={headingId}>
        <Link
          href="/constellation"
          className="enter-fade mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-line px-4 py-2 text-[11px] font-medium uppercase tracking-[2px] text-text-2 transition-colors hover:border-gold hover:text-gold"
          style={beat(1100)}
        >
          Open the Constellation <span aria-hidden="true">→</span>
        </Link>
      </ChapterText>
      <figure className="flex flex-col gap-6">
        <div className="relative w-full" style={{ aspectRatio: `${chapter.width} / ${chapter.height}` }}>
          <svg viewBox={`0 0 ${chapter.width} ${chapter.height}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <radialGradient id="wrapped-halo">
                <stop offset="0%" stopColor="var(--gold-light)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="var(--gold-light)" stopOpacity={0} />
              </radialGradient>
            </defs>
            {chapter.threads.map((thread, index) => (
              <line
                key={index}
                x1={thread.x1}
                y1={thread.y1}
                x2={thread.x2}
                y2={thread.y2}
                stroke="var(--gold)"
                strokeOpacity={thread.opacity * 0.8}
                strokeWidth={thread.sameBet ? 1.6 : 1}
                pathLength={1}
                className="enter-draw"
                style={beat(500, 900)}
              />
            ))}
            {chapter.stars.map((star, index) => {
              const style = STAR_STYLES[star.tone];
              return (
                <g key={star.magic} className="enter-fade" style={beat(700 + index * 160, 700)}>
                  {style.halo > 0 ? (
                    <circle cx={star.x} cy={star.y} r={star.r * style.halo} fill="url(#wrapped-halo)" opacity={style.haloOpacity} />
                  ) : null}
                  {star.tone === 'unassayed' ? (
                    <circle cx={star.x} cy={star.y} r={star.r} fill="none" stroke="var(--text-3)" strokeDasharray="2 2.5" />
                  ) : (
                    <circle cx={star.x} cy={star.y} r={star.r} fill={style.core} opacity={style.coreOpacity} />
                  )}
                  {star.drifting ? (
                    <circle cx={star.x} cy={star.y} r={star.r + 6} fill="none" stroke="var(--news)" strokeWidth={1} />
                  ) : null}
                  <text x={star.labelX} y={star.y - 2} textAnchor={star.labelAnchor} fontSize={14} className="fill-text-2">
                    {star.name}
                  </text>
                  <text x={star.labelX} y={star.y + 15} textAnchor={star.labelAnchor} fontSize={12} className="fill-text-3 font-mono">
                    {star.fineness}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Your EAs this month</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-[2px] text-text-3">
              <th className="pb-2 font-medium">EA</th>
              <th className="pb-2 font-medium">This month</th>
              <th className="pb-2 font-medium">Fineness</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {chapter.rows.map((row) => (
              <tr key={row.name} className="border-t border-line">
                <td className="py-2 text-text">{row.name}</td>
                <td className="py-2 font-mono text-text-2">
                  {row.trades} · <span className={row.netR.startsWith('−') ? 'text-oxblood-text' : 'text-jade'}>{row.netR}</span>
                </td>
                <td className="py-2 font-mono text-text-2">
                  {row.fineness} <span className="text-text-3">{row.label}</span>
                </td>
                <td className={cn('py-2 text-right text-[11px]', row.note === 'Drifting' ? 'text-news' : 'text-gold')}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <figcaption className="text-[11px] text-text-3">
          Brightness is Fineness, size the lots traded, and a thread how closely two EAs’ daily P&amp;L moves; an amber ring marks drift.
          As the Constellation stood at the end of the month.
        </figcaption>
      </figure>
    </div>
  );
}

/* 08 — The Assay Certificate ---------------------------------------------- */

function CertificateChapter({
  chapter,
  headingId,
  month,
  href,
}: {
  chapter: CertificateChapterView;
  headingId: string;
  month: string;
  href: string;
}) {
  return (
    <div className="grid w-full gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
      <ChapterText chapter={chapter} headingId={headingId}>
        <p className="enter-fade mt-6 font-mono text-[11px] leading-relaxed text-text-3" style={beat(900)}>
          {chapter.data.legend}
        </p>
        <CertificateActions
          postHref={certificateHref(month, 'post')}
          storyHref={certificateHref(month, 'story')}
          serial={chapter.data.serial}
          shareHref={href}
        />
        {chapter.data.demo ? (
          <p className="mt-5 text-[11px] leading-relaxed text-text-3">
            Demo data. The certificate says so in the metal, and in every image you download.
          </p>
        ) : null}
      </ChapterText>
      {/* On a phone the bar comes first: it is the chapter. */}
      <div className="order-first mx-auto w-full max-w-[520px] lg:order-none">
        <CertificateCard data={chapter.data} alt={chapter.alt} idPrefix={`cert-${month}`} motion />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export function WrappedChapter({
  chapter,
  headingId,
  month,
  href,
}: {
  chapter: WrappedChapterView;
  headingId: string;
  month: string;
  href: string;
}) {
  switch (chapter.kind) {
    case 'karat':
      return <KaratChapter chapter={chapter} headingId={headingId} />;
    case 'purity':
      return <PurityChapter chapter={chapter} headingId={headingId} month={month} />;
    case 'window':
      return <WindowChapter chapter={chapter} headingId={headingId} />;
    case 'gap':
      return <GapChapter chapter={chapter} headingId={headingId} />;
    case 'day':
      return <DayChapter chapter={chapter} headingId={headingId} />;
    case 'proof':
      return <ProofChapter chapter={chapter} headingId={headingId} />;
    case 'eas':
      return <EasChapter chapter={chapter} headingId={headingId} />;
    case 'certificate':
      return <CertificateChapter chapter={chapter} headingId={headingId} month={month} href={href} />;
  }
}

