import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { AssayCertificate, OG_FONTS } from '@/components/viz/AssayCertificate';
import { CERTIFICATE_FORMATS, certificateFilename, isCertificateFormat } from '@/components/viz/certificate';
import { getDemoDefaultMonth, getDemoWrapped, isDemoMonth } from '@/lib/demo/wrapped';

/**
 * `GET /api/certificate?month=YYYY-MM&format=post|story` — the Assay
 * Certificate as a PNG (CLAUDE.md §8.9, §17 Stage 7).
 *
 * Rendered on the server with `next/og` — Satori and resvg, the renderer
 * published as `@vercel/og` — from the same `AssayCertificate` tree the page
 * draws, with the same three families embedded from `assets/fonts`. So the
 * image is identical on every device, whatever fonts the phone has, at
 * exactly 1080 × 1350 (post) or 1080 × 1920 (story).
 *
 * Until Stage 8 brings real accounts it serves the demo, whose certificates
 * carry a `DEMO-` serial and "Demo data" struck into the bar. The demo is
 * seeded and frozen, so a month's image never changes: it is cached for good.
 */

export const runtime = 'nodejs';

type FontWeight = 400 | 500 | 600;

const FONT_FILES: readonly { name: string; weight: FontWeight; file: string }[] = [
  { name: OG_FONTS.serif, weight: 400, file: 'instrument-serif-latin-400-normal.woff' },
  { name: OG_FONTS.sans, weight: 500, file: 'manrope-latin-500-normal.woff' },
  { name: OG_FONTS.sans, weight: 600, file: 'manrope-latin-600-normal.woff' },
  { name: OG_FONTS.mono, weight: 400, file: 'jetbrains-mono-latin-400-normal.woff' },
  { name: OG_FONTS.mono, weight: 500, file: 'jetbrains-mono-latin-500-normal.woff' },
];

let fonts: Promise<{ name: string; data: Buffer; weight: FontWeight; style: 'normal' }[]> | null = null;

function loadFonts() {
  fonts ??= Promise.all(
    FONT_FILES.map(async (font) => ({
      name: font.name,
      weight: font.weight,
      style: 'normal' as const,
      data: await readFile(join(process.cwd(), 'assets', 'fonts', font.file)),
    })),
  );
  return fonts;
}

function plain(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const month = params.get('month') ?? getDemoDefaultMonth();
  const format = params.get('format') ?? 'post';

  if (!isCertificateFormat(format)) return plain(400, 'format must be post or story');
  if (!isDemoMonth(month)) return plain(404, `No month ${month} in the demo history`);

  const wrapped = getDemoWrapped(month);
  const certificate = wrapped.chapters.find((chapter) => chapter.kind === 'certificate');
  if (wrapped.state !== 'scored' || certificate?.kind !== 'certificate') {
    return plain(404, `Assaying… ${wrapped.label} holds too few trades for a certificate`);
  }

  const { width, height } = CERTIFICATE_FORMATS[format];
  return new ImageResponse(<AssayCertificate data={certificate} format={format} fonts={OG_FONTS} />, {
    width,
    height,
    fonts: await loadFonts(),
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${certificateFilename(certificate.serial, format)}"`,
    },
  });
}
