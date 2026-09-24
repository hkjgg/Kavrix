import { NextResponse } from 'next/server';
import { connectorPepper } from '@/lib/connector/token';
import { handleIngest } from '@/lib/ingest/service';
import { SupabaseIngestStore } from '@/lib/ingest/supabaseStore';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * `POST /api/ingest` — where the Kavrix Connector sends deals, SL/TP changes,
 * the USD calendar and heartbeats (CLAUDE.md §12). All the logic is in
 * `lib/ingest/service.ts`; this file only wires HTTP to it.
 *
 * Every response is JSON, including every failure: the connector reads the
 * status to decide whether to retry (5xx, 429) or give up on a batch (4xx).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const pepper = connectorPepper();
  const admin = createSupabaseAdminClient();
  if (pepper === null || admin === null) {
    return json(503, { error: 'not_configured', message: 'Ingest is not configured on this deployment.' });
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return json(400, { error: 'invalid_body', message: 'The body could not be read.' });
  }

  try {
    const result = await handleIngest(
      { authorization: request.headers.get('authorization'), body },
      { store: new SupabaseIngestStore(admin), pepper, nowMs: Date.now() },
    );
    return json(result.status, result.body, result.headers);
  } catch (error) {
    console.error('[ingest]', error);
    return json(500, { error: 'server_error', message: 'The batch was not stored. Retry it; nothing was half-written that a retry would duplicate.' });
  }
}

export function GET(): NextResponse {
  return json(405, { error: 'method_not_allowed', message: 'POST a batch (CLAUDE.md §12).' }, { Allow: 'POST' });
}
