import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * `GET /api/connector` — the Kavrix Connector's source, `KavrixConnector.mq5`,
 * as a download (CLAUDE.md §12). The trader compiles it in MetaEditor; the
 * source is the product, so there is nothing to hide in it and nothing
 * account-specific: the token is pasted into its inputs, never baked in.
 */

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const source = await readFile(join(process.cwd(), 'connector', 'KavrixConnector.mq5'));
    return new Response(new Uint8Array(source), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="KavrixConnector.mq5"',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('The connector source is not available on this deployment.', { status: 404 });
  }
}
