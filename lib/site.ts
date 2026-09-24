import { headers } from 'next/headers';

/**
 * This deployment's own origin: `NEXT_PUBLIC_SITE_URL` when set, otherwise the
 * request's host. Used for the links in auth emails and for the ingest URL a
 * trader allows in MetaTrader 5. Server-only.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const list = await headers();
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000';
  const local = host.startsWith('localhost') || host.startsWith('127.');
  const proto = list.get('x-forwarded-proto') ?? (local ? 'http' : 'https');
  return `${proto}://${host}`;
}
