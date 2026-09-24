import type { CSSProperties, ReactNode } from 'react';
import { formatKarat } from '@/lib/format';
import type { CertificateData, CertificateFormat } from './certificate';
import {
  BAR,
  CERTIFICATE_FORMATS,
  CERT_COLORS as C,
  ENGRAVE,
  ENGRAVE_LIGHT,
  ENGRAVE_SOFT,
  barOrigin,
  certificateFigures,
  guillochePaths,
  hallmarkRow,
  legendY,
  rosette,
  tierLine,
} from './certificate';

/**
 * The Assay Certificate (CLAUDE.md §8.9) — a cast bullion bar, engraved with
 * the month's Karat.
 *
 * **One component, two renderers.** The page draws it in the browser; the
 * PNG route (`app/api/certificate`) hands the very same tree to `next/og`
 * (Satori + resvg, i.e. `@vercel/og`). So it is written in the subset both
 * understand: absolutely positioned boxes in canvas pixels, inline styles,
 * `display: flex` on anything holding more than one child, literal colours
 * (§9 tokens, copied in `certificate.ts`), and the metal itself as inline SVG
 * — gradients, the guilloché and the hallmark recesses. No classes carry
 * layout, no CSS variables, no text inside SVG: every letter is set by the
 * renderer's own font, and the route embeds the same three families the page
 * loads.
 *
 * The bar is the one place outside the dial where the metallic gradient is
 * allowed (§9: signature elements). Lettering is struck into it: obsidian at
 * 84%, with a lit lower lip, the way a debossed letter catches light.
 *
 * What it shows is fixed by §17: Karat, tier, hallmarks, period, trade count
 * and serial. Never money, R totals or balances — a shared image is a public
 * surface. A demo certificate carries "Demo data" struck into the bar, so the
 * honest-demo rule (§2) survives a screenshot.
 *
 * `motion` adds the class hooks the page animates (the bar rising, one light
 * sweep, the stamp pressing in) and the sweep layer itself. The route never
 * sets it; `app/globals.css` declares the motion only when it is welcome.
 */

export interface CertificateFonts {
  serif: string;
  sans: string;
  mono: string;
}

/** The families the PNG route registers with `next/og`. */
export const OG_FONTS: CertificateFonts = {
  serif: 'Instrument Serif',
  sans: 'Manrope',
  mono: 'JetBrains Mono',
};

/** The same families on the page, through the `next/font` variables. */
export const PAGE_FONTS: CertificateFonts = {
  serif: 'var(--font-instrument-serif), Georgia, serif',
  sans: 'var(--font-manrope), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
};

export interface AssayCertificateProps {
  data: CertificateData;
  format: CertificateFormat;
  fonts: CertificateFonts;
  /** Prefix for SVG ids, so two certificates on one page never share a gradient. */
  idPrefix?: string;
  /** Adds the on-screen reveal hooks and the sweep layer. */
  motion?: boolean;
}

const FACE = { x: BAR.bevel, y: BAR.bevel, width: BAR.width - BAR.bevel * 2, height: BAR.height - BAR.bevel * 2 };
const FRAME = {
  x: BAR.frameInset,
  y: BAR.frameInset,
  width: BAR.width - BAR.frameInset * 2,
  height: BAR.height - BAR.frameInset * 2,
};
const CENTRE_X = BAR.width / 2;

/* Vertical rhythm on the bar, in bar pixels from its top edge. */
const Y = {
  wordmark: 96,
  title: 172,
  titleRule: 206,
  marks: 244,
  numeral: 360,
  tier: 632,
  month: 686,
  toDate: 752,
  ruleTop: 790,
  figureLabel: 822,
  figureValue: 852,
  ruleBottom: 918,
  serial: 944,
  demo: 978,
} as const;

/* The hallmark row: maker's lozenge, fineness cartouche, date shield. */
const MARK_HEIGHT = 72;
const MARKS = {
  sponsor: { width: 72 },
  fineness: { width: 136 },
  date: { width: 96 },
  gap: 18,
} as const;
const MARKS_WIDTH = MARKS.sponsor.width + MARKS.fineness.width + MARKS.date.width + MARKS.gap * 2;

const GUILLOCHE_A = guillochePaths({ width: FACE.width, height: FACE.height, spacing: 17, amplitude: 7, wavelength: 58, drift: 7 });
const GUILLOCHE_B = guillochePaths({ width: FACE.width, height: FACE.height, spacing: 17, amplitude: 7, wavelength: 58, drift: -7 });
const ROSETTE = rosette(CENTRE_X - FACE.x, 470 - FACE.y, 48, 64, 150);

/** A block of text centred across `width`, its box starting at `top`. */
function Line({
  top,
  left = 0,
  width,
  size,
  family,
  weight = 400,
  spacing = 0,
  color = ENGRAVE,
  shadow = ENGRAVE_LIGHT,
  height,
  children,
}: {
  top: number;
  left?: number;
  width: number;
  size: number;
  family: string;
  weight?: number;
  spacing?: number;
  color?: string;
  shadow?: string | null;
  height?: number;
  children: string;
}) {
  const style: CSSProperties = {
    position: 'absolute',
    top,
    left,
    width,
    height: height ?? Math.round(size * 1.2),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: family,
    fontSize: size,
    fontWeight: weight,
    lineHeight: 1,
    letterSpacing: spacing,
    // Tracking adds space after the last letter too; pad the front to match
    // so the line stays optically centred.
    paddingLeft: spacing,
    color,
    whiteSpace: 'nowrap',
  };
  if (shadow !== null) style.textShadow = shadow;
  return <div style={style}>{children}</div>;
}

/**
 * A debossed hairline: a dark cut with the light catching its lower edge.
 *
 * Called as a function, never as `<EngravedRule />`: Satori serialises an
 * `<svg>` subtree as it stands and does not render components inside it.
 */
function engravedRule(key: string, x1: number, x2: number, y: number) {
  return (
    <g key={key}>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={C.bg} strokeOpacity={0.42} strokeWidth={1.4} />
      <line x1={x1} y1={y + 1.6} x2={x2} y2={y + 1.6} stroke={C.goldLight} strokeOpacity={0.55} strokeWidth={1} />
    </g>
  );
}

function BarArt({ id, demo }: { id: (name: string) => string; demo: boolean }) {
  const figureColumn = FRAME.width / 3;
  return (
    <svg
      width={BAR.width}
      height={BAR.height}
      viewBox={`0 0 ${BAR.width} ${BAR.height}`}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <defs>
        {/* The sloped edge: lit from the upper left, falling into shade. */}
        <linearGradient id={id('body')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.goldLight} />
          <stop offset="28%" stopColor={C.gold} />
          <stop offset="64%" stopColor={C.goldDeep} />
          <stop offset="88%" stopColor={C.gold} />
          <stop offset="100%" stopColor={C.goldDeep} />
        </linearGradient>
        {/* The face: champagne where the light lands, gold, deepening to the far corner. */}
        <linearGradient id={id('face')} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={C.champagne} />
          <stop offset="42%" stopColor={C.gold} />
          <stop offset="78%" stopColor={C.gold} />
          <stop offset="100%" stopColor={C.goldDeep} />
        </linearGradient>
        <radialGradient id={id('sheen')} cx="0.3" cy="0.18" r="0.7">
          <stop offset="0%" stopColor={C.goldLight} stopOpacity={0.55} />
          <stop offset="55%" stopColor={C.goldLight} stopOpacity={0.08} />
          <stop offset="100%" stopColor={C.goldLight} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={id('lip')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.goldLight} stopOpacity={0.95} />
          <stop offset="60%" stopColor={C.gold} stopOpacity={0.4} />
          <stop offset="100%" stopColor={C.bg} stopOpacity={0.45} />
        </linearGradient>
        <clipPath id={id('face-clip')}>
          <rect x={FACE.x} y={FACE.y} width={FACE.width} height={FACE.height} rx={26} />
        </clipPath>
        <clipPath id={id('body-clip')}>
          <rect x={0} y={0} width={BAR.width} height={BAR.height} rx={BAR.radius} />
        </clipPath>
      </defs>

      {/* Body and its four bevels, top and left lit, right and bottom in shade. */}
      <rect x={0} y={0} width={BAR.width} height={BAR.height} rx={BAR.radius} fill={`url(#${id('body')})`} />
      <g clipPath={`url(#${id('body-clip')})`}>
        <polygon points={`0,0 ${BAR.width},0 ${BAR.width - BAR.bevel},${BAR.bevel} ${BAR.bevel},${BAR.bevel}`} fill={C.goldLight} fillOpacity={0.32} />
        <polygon points={`0,0 ${BAR.bevel},${BAR.bevel} ${BAR.bevel},${BAR.height - BAR.bevel} 0,${BAR.height}`} fill={C.goldLight} fillOpacity={0.16} />
        <polygon
          points={`${BAR.width},0 ${BAR.width},${BAR.height} ${BAR.width - BAR.bevel},${BAR.height - BAR.bevel} ${BAR.width - BAR.bevel},${BAR.bevel}`}
          fill={C.bg}
          fillOpacity={0.2}
        />
        <polygon
          points={`0,${BAR.height} ${BAR.bevel},${BAR.height - BAR.bevel} ${BAR.width - BAR.bevel},${BAR.height - BAR.bevel} ${BAR.width},${BAR.height}`}
          fill={C.bg}
          fillOpacity={0.34}
        />
      </g>
      <rect
        x={0.75}
        y={0.75}
        width={BAR.width - 1.5}
        height={BAR.height - 1.5}
        rx={BAR.radius}
        fill="none"
        stroke={C.goldDeep}
        strokeWidth={1.5}
      />

      {/* The face, its sheen, and the engine-turned lattice. */}
      <rect x={FACE.x} y={FACE.y} width={FACE.width} height={FACE.height} rx={26} fill={`url(#${id('face')})`} />
      <g clipPath={`url(#${id('face-clip')})`}>
        <g transform={`translate(${FACE.x} ${FACE.y})`} fill="none" stroke={C.goldDeep} strokeWidth={0.9}>
          <g strokeOpacity={0.17}>
            {GUILLOCHE_A.map((d, index) => (
              <path key={`a${index}`} d={d} />
            ))}
          </g>
          <g strokeOpacity={0.13}>
            {GUILLOCHE_B.map((d, index) => (
              <path key={`b${index}`} d={d} />
            ))}
          </g>
          {/* A rose-engine rosette behind the numeral, finer than the lattice. */}
          <g strokeOpacity={0.12} strokeWidth={0.8}>
            {ROSETTE.map((circle, index) => (
              <circle key={`r${index}`} cx={circle.cx} cy={circle.cy} r={circle.r} />
            ))}
          </g>
        </g>
        <rect x={FACE.x} y={FACE.y} width={FACE.width} height={FACE.height} fill={`url(#${id('sheen')})`} />
      </g>
      <rect
        x={FACE.x + 0.5}
        y={FACE.y + 0.5}
        width={FACE.width - 1}
        height={FACE.height - 1}
        rx={26}
        fill="none"
        stroke={`url(#${id('lip')})`}
        strokeWidth={1.4}
      />

      {/* The engraved frame. */}
      <rect x={FRAME.x} y={FRAME.y} width={FRAME.width} height={FRAME.height} rx={16} fill="none" stroke={C.bg} strokeOpacity={0.4} strokeWidth={1.4} />
      <rect
        x={FRAME.x + 1.2}
        y={FRAME.y + 1.6}
        width={FRAME.width - 2.4}
        height={FRAME.height - 2.4}
        rx={15}
        fill="none"
        stroke={C.goldLight}
        strokeOpacity={0.5}
        strokeWidth={1}
      />

      {engravedRule('title', CENTRE_X - 70, CENTRE_X + 70, Y.titleRule)}
      {engravedRule('top', FRAME.x + 28, FRAME.x + FRAME.width - 28, Y.ruleTop)}
      {engravedRule('bottom', FRAME.x + 28, FRAME.x + FRAME.width - 28, Y.ruleBottom)}
      {[1, 2].map((column) => (
        <g key={column}>
          <line
            x1={FRAME.x + figureColumn * column}
            y1={Y.ruleTop + 26}
            x2={FRAME.x + figureColumn * column}
            y2={Y.ruleBottom - 26}
            stroke={C.bg}
            strokeOpacity={0.35}
            strokeWidth={1.2}
          />
          <line
            x1={FRAME.x + figureColumn * column + 1.4}
            y1={Y.ruleTop + 26}
            x2={FRAME.x + figureColumn * column + 1.4}
            y2={Y.ruleBottom - 26}
            stroke={C.goldLight}
            strokeOpacity={0.45}
            strokeWidth={0.9}
          />
        </g>
      ))}

      {/* "Demo data", struck in a cartouche of its own (§2). */}
      {demo ? (
        <g>
          <rect x={CENTRE_X - 96} y={Y.demo} width={192} height={34} rx={17} fill={C.goldDeep} fillOpacity={0.22} stroke={C.bg} strokeOpacity={0.5} strokeWidth={1.2} />
          <rect x={CENTRE_X - 93} y={Y.demo + 3.4} width={186} height={28} rx={14} fill="none" stroke={C.goldLight} strokeOpacity={0.4} strokeWidth={0.9} />
        </g>
      ) : null}
    </svg>
  );
}

/** The three recesses the marks are struck into. */
function MarkArt() {
  const x1 = MARKS.sponsor.width + MARKS.gap;
  const x2 = x1 + MARKS.fineness.width + MARKS.gap;
  const h = MARK_HEIGHT;
  const recess = { fill: C.goldDeep, fillOpacity: 0.3, stroke: C.bg, strokeOpacity: 0.55, strokeWidth: 1.5 } as const;
  const lip = { fill: 'none', stroke: C.goldLight, strokeOpacity: 0.5, strokeWidth: 1 } as const;
  return (
    <svg width={MARKS_WIDTH} height={h + 4} viewBox={`0 0 ${MARKS_WIDTH} ${h + 4}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <polygon points={`36,1 71,36 36,71 1,36`} {...recess} />
      <polygon points={`36,8 64,36 36,64 8,36`} {...lip} />
      <rect x={x1 + 0.75} y={0.75} width={MARKS.fineness.width - 1.5} height={h - 1.5} rx={16} {...recess} />
      <rect x={x1 + 6} y={6} width={MARKS.fineness.width - 12} height={h - 12} rx={11} {...lip} />
      <path d={`M${x2 + 1} 1 H${x2 + MARKS.date.width - 1} V${h * 0.6} Q${x2 + MARKS.date.width - 1} ${h - 1} ${x2 + MARKS.date.width / 2} ${h - 1} Q${x2 + 1} ${h - 1} ${x2 + 1} ${h * 0.6} Z`} {...recess} />
      <path d={`M${x2 + 7} 7 H${x2 + MARKS.date.width - 7} V${h * 0.58} Q${x2 + MARKS.date.width - 7} ${h - 7} ${x2 + MARKS.date.width / 2} ${h - 7} Q${x2 + 7} ${h - 7} ${x2 + 7} ${h * 0.58} Z`} {...lip} />
    </svg>
  );
}

function Absolute({ style, className, children }: { style: CSSProperties; className?: string; children: ReactNode }) {
  return (
    <div className={className} style={{ position: 'absolute', display: 'flex', ...style }}>
      {children}
    </div>
  );
}

export function AssayCertificate({ data, format, fonts, idPrefix = 'kavrix-cert', motion = false }: AssayCertificateProps) {
  const { width, height } = CERTIFICATE_FORMATS[format];
  const origin = barOrigin(format);
  const id = (name: string) => `${idPrefix}-${name}`;
  const marks = hallmarkRow(data);
  const figures = certificateFigures(data);
  const figureColumn = FRAME.width / 3;
  const marksLeft = CENTRE_X - MARKS_WIDTH / 2;
  const fineX = MARKS.sponsor.width + MARKS.gap;
  const dateX = fineX + MARKS.fineness.width + MARKS.gap;
  const legendTop = legendY(format);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width,
        height,
        backgroundColor: C.bg,
        overflow: 'hidden',
        fontFamily: fonts.sans,
      }}
    >
      {/* The obsidian ground: a vignette, the fine gold border, the bar's shadow. */}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <radialGradient id={id('ground')} cx="0.5" cy="0.45" r="0.75">
            <stop offset="0%" stopColor={C.surface1} />
            <stop offset="60%" stopColor={C.bg} />
            <stop offset="100%" stopColor="#040405" />
          </radialGradient>
          <radialGradient id={id('shadow')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#000000" stopOpacity={0.85} />
            <stop offset="100%" stopColor="#000000" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={width} height={height} fill={`url(#${id('ground')})`} />
        <rect x={28.5} y={28.5} width={width - 57} height={height - 57} fill="none" stroke={C.gold} strokeOpacity={0.5} strokeWidth={1} />
        <rect x={36.5} y={36.5} width={width - 73} height={height - 73} fill="none" stroke={C.gold} strokeOpacity={0.16} strokeWidth={1} />
        <ellipse
          cx={width / 2}
          cy={origin.y + BAR.height + 6}
          rx={BAR.width * 0.52}
          ry={34}
          fill={`url(#${id('shadow')})`}
        />
      </svg>

      {format === 'story' ? (
        <>
          <Line top={origin.y - 178} width={width} size={46} family={fonts.serif} spacing={19} color={C.gold} shadow={null}>
            KAVRIX
          </Line>
          <Line top={origin.y - 106} width={width} size={14} family={fonts.sans} weight={600} spacing={6} color={C.text3} shadow={null}>
            MONTHLY ASSAY
          </Line>
        </>
      ) : null}

      {/* ── The bar ─────────────────────────────────────────────────────── */}
      <Absolute
        className={motion ? 'cert-bar' : undefined}
        style={{ left: origin.x, top: origin.y, width: BAR.width, height: BAR.height }}
      >
        <BarArt id={id} demo={data.demo} />

        <Line top={Y.wordmark} width={BAR.width} size={62} family={fonts.serif} spacing={26}>
          KAVRIX
        </Line>
        <Line top={Y.title} width={BAR.width} size={15} family={fonts.sans} weight={600} spacing={7}>
          ASSAY CERTIFICATE
        </Line>

        {/* The hallmarks, struck in a row. */}
        <Absolute
          className={motion ? 'cert-stamp' : undefined}
          style={{ left: marksLeft, top: Y.marks, width: MARKS_WIDTH, height: MARK_HEIGHT + 4 }}
        >
          <MarkArt />
          <Line top={0} left={0} width={MARKS.sponsor.width} height={MARK_HEIGHT} size={40} family={fonts.serif}>
            {marks.sponsor}
          </Line>
          <Line top={0} left={fineX} width={MARKS.fineness.width} height={MARK_HEIGHT} size={44} family={fonts.serif} spacing={1}>
            {marks.fineness}
          </Line>
          <Line top={12} left={dateX} width={MARKS.date.width} height={18} size={14} family={fonts.sans} weight={600} spacing={3}>
            {marks.dateMonth}
          </Line>
          <Line top={32} left={dateX} width={MARKS.date.width} height={30} size={28} family={fonts.serif}>
            {marks.dateYear}
          </Line>
        </Absolute>

        <Line top={Y.numeral} width={BAR.width} height={260} size={246} family={fonts.serif} spacing={-4}>
          {formatKarat(data.karat)}
        </Line>
        <Line top={Y.tier} width={BAR.width} size={24} family={fonts.sans} weight={600} spacing={9}>
          {tierLine(data.tier)}
        </Line>
        <Line top={Y.month} width={BAR.width} height={64} size={60} family={fonts.serif} spacing={3}>
          {data.monthName}
        </Line>
        {data.partial ? (
          <Line top={Y.toDate} width={BAR.width} size={15} family={fonts.sans} weight={600} spacing={7}>
            MONTH TO DATE
          </Line>
        ) : null}

        {figures.map((figure, index) => (
          <Absolute key={figure.label} style={{ left: FRAME.x + figureColumn * index, top: 0, width: figureColumn, height: BAR.height }}>
            <Line top={Y.figureLabel} width={figureColumn} size={13} family={fonts.sans} weight={600} spacing={4} color={ENGRAVE_SOFT}>
              {figure.label.toUpperCase()}
            </Line>
            <Line top={Y.figureValue} width={figureColumn} height={44} size={index === 2 ? 30 : 38} family={fonts.mono} weight={500}>
              {figure.value}
            </Line>
          </Absolute>
        ))}

        <Line top={Y.serial} width={BAR.width} size={19} family={fonts.mono} spacing={5}>
          {`No. ${data.serial}`}
        </Line>
        {data.demo ? (
          <Line top={Y.demo} width={BAR.width} height={34} size={13} family={fonts.sans} weight={600} spacing={6}>
            DEMO DATA
          </Line>
        ) : null}

        {/* One light across the metal, then gone. On the page only. */}
        {motion ? (
          <div
            aria-hidden="true"
            className="cert-sweep"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: BAR.width,
              height: BAR.height,
              borderRadius: BAR.radius,
              overflow: 'hidden',
            }}
          />
        ) : null}
      </Absolute>

      {/* ── Beneath the bar ─────────────────────────────────────────────── */}
      <Line top={legendTop} width={width} size={17} family={fonts.mono} spacing={3} color={C.gold} shadow={null}>
        {data.legend}
      </Line>
      {format === 'story' ? (
        <>
          <Line top={legendTop + 92} width={width} height={44} size={36} family={fonts.serif} color={C.text2} shadow={null}>
            Profit tells you what happened.
          </Line>
          <Line top={legendTop + 140} width={width} height={44} size={36} family={fonts.serif} color={C.gold} shadow={null}>
            Karat tells you if it will last.
          </Line>
        </>
      ) : null}
    </div>
  );
}
