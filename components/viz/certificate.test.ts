import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { AssayCertificate, OG_FONTS } from './AssayCertificate';
import type { CertificateData } from './certificate';
import {
  BAR,
  CERTIFICATE_FORMATS,
  CERT_COLORS,
  barOrigin,
  certificateAlt,
  certificateFigures,
  certificateFilename,
  certificateHref,
  guillochePaths,
  hallmarkRow,
  isCertificateFormat,
  legendY,
  rosette,
  tierLine,
} from './certificate';

/** The Assay Certificate's geometry and words (CLAUDE.md §8.9, §17 Stage 7). */

const DATA: CertificateData = {
  karat: 21.9,
  tier: '18K · Solid',
  monthName: 'AUGUST 2026',
  partial: false,
  period: '1–31 Aug',
  tradeCount: 66,
  tradingDays: 21,
  serial: 'DEMO-088723',
  demo: true,
  legend: 'KAVRIX ASSAY · 21.9K · AUGUST 2026 · No. DEMO-088723',
};

describe('formats and placement', () => {
  it('exports a post at 1080 × 1350 and a story at 1080 × 1920', () => {
    expect(CERTIFICATE_FORMATS).toEqual({ post: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } });
    expect(isCertificateFormat('post')).toBe(true);
    expect(isCertificateFormat('square')).toBe(false);
    expect(isCertificateFormat(null)).toBe(false);
  });

  it('centres the bar across both canvases and keeps the legend on them', () => {
    for (const format of ['post', 'story'] as const) {
      const { width, height } = CERTIFICATE_FORMATS[format];
      const origin = barOrigin(format);
      expect(origin.x * 2 + BAR.width).toBe(width);
      expect(origin.y).toBeGreaterThan(40);
      expect(legendY(format) + 40).toBeLessThan(height - 40);
    }
    // (1920 − 1080) ÷ 2 − 30.
    expect(barOrigin('story').y).toBe(390);
  });
});

describe('the palette', () => {
  it('is the §9 tokens, letter for letter as app/globals.css declares them', () => {
    const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1]?.toLowerCase();
    expect(CERT_COLORS.bg).toBe(token('bg'));
    expect(CERT_COLORS.surface1).toBe(token('surface-1'));
    expect(CERT_COLORS.gold).toBe(token('gold'));
    expect(CERT_COLORS.goldLight).toBe(token('gold-light'));
    expect(CERT_COLORS.goldDeep).toBe(token('gold-deep'));
    expect(CERT_COLORS.champagne).toBe(token('champagne'));
    expect(CERT_COLORS.text2).toBe(token('text-2'));
    expect(CERT_COLORS.text3).toBe(token('text-3'));
  });
});

describe('guilloché', () => {
  it('draws one waved line per spacing, the same bytes every time', () => {
    const options = { width: 716, height: 1036, spacing: 17, amplitude: 7, wavelength: 58, drift: 7 };
    const paths = guillochePaths(options);
    expect(paths).toHaveLength(Math.floor(1036 / 17) + 2);
    expect(guillochePaths(options)).toEqual(paths);
    // Each line: one explicit half-wave, then reflected ones.
    expect(paths[0]).toMatch(/^M-58 0Q-43\.5 -14 -29 0(T[-\d.]+ 0)+$/);
    // Drifting the other way shifts the phase, not the lines.
    expect(guillochePaths({ ...options, drift: -7 })[1]).not.toBe(paths[1]);
  });

  it('turns a rosette of equal circles on one ring', () => {
    const circles = rosette(100, 100, 4, 10, 30);
    expect(circles).toEqual([
      { cx: 110, cy: 100, r: 30 },
      { cx: 100, cy: 110, r: 30 },
      { cx: 90, cy: 100, r: 30 },
      { cx: 100, cy: 90, r: 30 },
    ]);
  });
});

describe('words on the bar', () => {
  it('strikes the maker, the fineness and the date', () => {
    expect(hallmarkRow(DATA)).toEqual({ sponsor: 'K', fineness: '18K', dateMonth: 'AUG', dateYear: '26' });
    expect(hallmarkRow({ tier: 'Raw Ore', monthName: 'JUNE 2026' }).fineness).toBe('RAW');
    expect(tierLine('Raw Ore')).toBe('RAW ORE');
  });

  it('carries counts and dates only — never money, never R', () => {
    expect(certificateFigures(DATA)).toEqual([
      { label: 'Trades', value: '66' },
      { label: 'Trading days', value: '21' },
      { label: 'Period', value: '1–31 AUG' },
    ]);
    expect(certificateFigures({ ...DATA, partial: true })[2]?.label).toBe('To date');
    const markup = renderToStaticMarkup(createElement(AssayCertificate, { data: DATA, format: 'post', fonts: OG_FONTS }));
    expect(markup).not.toMatch(/\$|\d(\.\d+)?R\b/);
    expect(markup).toContain('21.9K');
    expect(markup).toContain('No. DEMO-088723');
    expect(markup).toContain('DEMO DATA');
  });

  it('says "Demo data" only on a demo, and "Month to date" only on a partial month', () => {
    const real = renderToStaticMarkup(
      createElement(AssayCertificate, { data: { ...DATA, demo: false, serial: '088723' }, format: 'story', fonts: OG_FONTS }),
    );
    expect(real).not.toContain('DEMO DATA');
    expect(real).not.toContain('MONTH TO DATE');
    const partial = renderToStaticMarkup(createElement(AssayCertificate, { data: { ...DATA, partial: true }, format: 'post', fonts: OG_FONTS }));
    expect(partial).toContain('MONTH TO DATE');
  });

  it('only adds the reveal hooks on the page', () => {
    const still = renderToStaticMarkup(createElement(AssayCertificate, { data: DATA, format: 'post', fonts: OG_FONTS }));
    expect(still).not.toContain('cert-sweep');
    const moving = renderToStaticMarkup(createElement(AssayCertificate, { data: DATA, format: 'post', fonts: OG_FONTS, motion: true }));
    for (const hook of ['cert-bar', 'cert-sweep', 'cert-stamp']) expect(moving).toContain(hook);
  });

  it('describes itself in words, and names its files and route', () => {
    expect(certificateAlt(DATA)).toBe(
      'Assay Certificate: 21.9K, 18K · Solid · August 2026 · 66 trades over 21 trading days, 1–31 Aug · No. DEMO-088723 · Demo data',
    );
    expect(certificateHref('2026-08', 'story')).toBe('/api/certificate?month=2026-08&format=story');
    expect(certificateFilename('DEMO-088723', 'post')).toBe('kavrix-assay-demo-088723-post.png');
  });
});
