/**
 * The Assay Certificate's geometry (CLAUDE.md §8.9) — pure, so the page and
 * the PNG route draw the same bar from the same numbers.
 *
 * Everything is laid out in canvas pixels at the export size: 1080 wide,
 * 1350 tall for a post and 1920 for a story. The page scales the whole canvas
 * down with one transform; the route renders it 1:1. Nothing here reads the
 * DOM, a font or the clock.
 */

import { formatKarat } from '@/lib/format';

export type CertificateFormat = 'post' | 'story';

export const CERTIFICATE_FORMATS: Record<CertificateFormat, { width: number; height: number }> = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

export function isCertificateFormat(value: string | null | undefined): value is CertificateFormat {
  return value === 'post' || value === 'story';
}

/**
 * The §9 palette as literals. The PNG renderer cannot read CSS variables, so
 * the certificate carries its own copy — and a test holds it to
 * `app/globals.css`, so the two can never drift.
 */
export const CERT_COLORS = {
  bg: '#0a0a0c',
  surface1: '#111114',
  gold: '#d4af6a',
  goldLight: '#f3dfa8',
  goldDeep: '#8c6a2f',
  champagne: '#e9d8a6',
  text2: '#b8b2a6',
  text3: '#8e897f',
} as const;

/** Letters struck into the metal: obsidian, not quite opaque, so the gold warms it. */
export const ENGRAVE = 'rgba(10, 10, 12, 0.84)';
export const ENGRAVE_SOFT = 'rgba(10, 10, 12, 0.6)';
/** The lit lower lip of a debossed letter. */
export const ENGRAVE_LIGHT = '0px 1.5px 0px rgba(243, 223, 168, 0.55)';

/** The bar, in canvas pixels. */
export const BAR = {
  width: 760,
  height: 1080,
  radius: 46,
  /** The sloped edge between the outer body and the face. */
  bevel: 22,
  /** The engraved frame, inset from the bar's edge. */
  frameInset: 56,
} as const;

/** Where the bar sits on each canvas. */
export function barOrigin(format: CertificateFormat): { x: number; y: number } {
  const { width, height } = CERTIFICATE_FORMATS[format];
  const x = (width - BAR.width) / 2;
  // A post leaves room beneath the bar for the legend; a story centres it,
  // a touch high, with the wordmark above and the legend and tagline below.
  const y = format === 'post' ? 84 : Math.round((height - BAR.height) / 2) - 30;
  return { x, y };
}

/** The line under the bar: `KAVRIX ASSAY · 21.4K · SEPTEMBER 2026 · No. 000147`. */
export function legendY(format: CertificateFormat): number {
  return barOrigin(format).y + BAR.height + 56;
}

/* -------------------------------------------------------------------------
 * Guilloché
 * ---------------------------------------------------------------------- */

export interface GuillocheOptions {
  width: number;
  height: number;
  /** Distance between neighbouring lines. */
  spacing: number;
  amplitude: number;
  wavelength: number;
  /** Phase shift from one line to the next, in pixels. The sign sets the braid's direction. */
  drift: number;
}

/**
 * One family of waved lines, as quadratic-curve paths (`Q` then `T`, so each
 * line is a few dozen bytes). Two families drifting opposite ways cross into
 * the barleycorn lattice an engine-turned bar carries.
 */
export function guillochePaths(options: GuillocheOptions): string[] {
  const { width, height, spacing, amplitude, wavelength, drift } = options;
  const half = wavelength / 2;
  const paths: string[] = [];
  const count = Math.floor(height / spacing) + 2;
  for (let line = 0; line < count; line += 1) {
    const y = line * spacing;
    // Start a whole wavelength before the edge so every line fills the width.
    const phase = ((line * drift) % wavelength + wavelength) % wavelength;
    let x = -wavelength + phase;
    const parts = [`M${round1(x)} ${round1(y)}`];
    // First half-wave with an explicit control point; `T` reflects it after.
    parts.push(`Q${round1(x + half / 2)} ${round1(y - amplitude * 2)} ${round1(x + half)} ${round1(y)}`);
    x += half;
    while (x < width + wavelength) {
      x += half;
      parts.push(`T${round1(x)} ${round1(y)}`);
    }
    paths.push(parts.join(''));
  }
  return paths;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A rose-engine rosette: `count` circles of `radius`, centred on a ring of `offset`. */
export function rosette(cx: number, cy: number, count: number, offset: number, radius: number): { cx: number; cy: number; r: number }[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      cx: round1(cx + Math.cos(angle) * offset),
      cy: round1(cy + Math.sin(angle) * offset),
      r: radius,
    };
  });
}

/* -------------------------------------------------------------------------
 * Words on the bar
 * ---------------------------------------------------------------------- */

export interface CertificateData {
  karat: number;
  /** `18K · Solid`, `Raw Ore`. */
  tier: string;
  /** `AUGUST 2026`. */
  monthName: string;
  partial: boolean;
  /** `1–31 Aug`. */
  period: string;
  tradeCount: number;
  tradingDays: number;
  serial: string;
  demo: boolean;
  legend: string;
}

/** The three marks struck in a row, the way an assay office hallmarks a bar. */
export interface HallmarkRow {
  /** The maker's mark. */
  sponsor: string;
  /** The fineness mark: the tier's karat, `18K`, or `RAW`. */
  fineness: string;
  /** The date mark: `AUG` over `26`. */
  dateMonth: string;
  dateYear: string;
}

export function hallmarkRow(data: Pick<CertificateData, 'tier' | 'monthName'>): HallmarkRow {
  const [karatPart] = data.tier.split(' · ');
  const fineness = karatPart !== undefined && /^\d+K$/.test(karatPart) ? karatPart : 'RAW';
  const [month = '', year = ''] = data.monthName.split(' ');
  return { sponsor: 'K', fineness, dateMonth: month.slice(0, 3), dateYear: year.slice(2) };
}

/** `18K · Solid` → `18K · SOLID`; `Raw Ore` → `RAW ORE`. */
export function tierLine(tier: string): string {
  return tier.toUpperCase();
}

export interface CertificateFigure {
  label: string;
  value: string;
}

/**
 * The three supporting figures. Counts and dates only: the certificate is a
 * public surface, and CLAUDE.md §17 keeps money and R totals off it.
 */
export function certificateFigures(data: CertificateData): CertificateFigure[] {
  return [
    { label: 'Trades', value: String(data.tradeCount) },
    { label: 'Trading days', value: String(data.tradingDays) },
    { label: data.partial ? 'To date' : 'Period', value: data.period.toUpperCase() },
  ];
}

/** Words for a screen reader, and the PNG's alt text. */
export function certificateAlt(data: CertificateData): string {
  return [
    `Assay Certificate: ${formatKarat(data.karat)}, ${data.tier}`,
    `${data.monthName.charAt(0)}${data.monthName.slice(1).toLowerCase()}${data.partial ? ', month to date' : ''}`,
    `${data.tradeCount} trades over ${data.tradingDays} trading days, ${data.period}`,
    `No. ${data.serial}`,
    data.demo ? 'Demo data' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** The route that renders a month's certificate as a PNG. */
export function certificateHref(month: string, format: CertificateFormat): string {
  return `/api/certificate?month=${month}&format=${format}`;
}

export function certificateFilename(serial: string, format: CertificateFormat): string {
  return `kavrix-assay-${serial.toLowerCase()}-${format}.png`;
}
