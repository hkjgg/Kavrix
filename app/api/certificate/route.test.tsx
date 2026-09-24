import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * `GET /api/certificate` — the certificate as a PNG, pixel-exact at both
 * sizes (CLAUDE.md §17 Stage 7). Width and height are read from the PNG's own
 * IHDR chunk, not from a header the route sets.
 */

async function fetchCertificate(query: string) {
  const response = await GET(new Request(`http://localhost/api/certificate${query}`));
  const body = Buffer.from(await response.arrayBuffer());
  return { response, body };
}

function pngSize(body: Buffer): { width: number; height: number } {
  expect(body.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

describe('/api/certificate', () => {
  it('renders a post at exactly 1080 × 1350', async () => {
    const { response, body } = await fetchCertificate('?month=2026-08&format=post');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toContain('kavrix-assay-demo-088723-post.png');
    expect(pngSize(body)).toEqual({ width: 1080, height: 1350 });
  }, 30_000);

  it('renders a story at exactly 1080 × 1920, the same image every time', async () => {
    const first = await fetchCertificate('?month=2026-09&format=story');
    const second = await fetchCertificate('?month=2026-09&format=story');
    expect(pngSize(first.body)).toEqual({ width: 1080, height: 1920 });
    expect(first.body.equals(second.body)).toBe(true);
  }, 30_000);

  it('refuses an unknown format and a month outside the history', async () => {
    expect((await fetchCertificate('?month=2026-08&format=square')).response.status).toBe(400);
    expect((await fetchCertificate('?month=2025-01&format=post')).response.status).toBe(404);
    expect((await fetchCertificate('?month=nonsense')).response.status).toBe(404);
  });
});
