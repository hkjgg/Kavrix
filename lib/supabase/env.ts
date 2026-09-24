/**
 * Where Supabase lives, read from the environment (see `.env.example`).
 *
 * Nothing here is hardcoded, and the two halves are kept apart on purpose:
 * the URL and the anon key are public (they ship to the browser, and RLS is
 * what protects the data), while the service-role key bypasses RLS and is read
 * only by server code — the ingest API and nothing that renders a page.
 *
 * A deployment without Supabase still builds and still serves `/demo`: every
 * reader returns `null` rather than throwing, and the auth pages say that
 * accounts are not configured.
 */

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

function read(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? null : value.trim();
}

/** The project URL and anon key, or `null` when this deployment has no Supabase. */
export function supabasePublicConfig(): SupabasePublicConfig | null {
  // Written out in full so Next can inline them into the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  return url === '' || anonKey === '' ? null : { url, anonKey };
}

/** The service-role key. Server-only: never import this from a client component. */
export function supabaseServiceRoleKey(): string | null {
  return read('SUPABASE_SERVICE_ROLE_KEY');
}

/** Whether sign-up and sign-in can work on this deployment. */
export function isAuthConfigured(): boolean {
  return supabasePublicConfig() !== null;
}
