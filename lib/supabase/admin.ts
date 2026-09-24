import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { supabasePublicConfig, supabaseServiceRoleKey } from './env';

/**
 * A service-role client. It bypasses RLS, so it is used in exactly one place:
 * the ingest API, after a connector token has been verified and the account
 * resolved from it. Never from a page, never from the browser.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  const config = supabasePublicConfig();
  const key = supabaseServiceRoleKey();
  if (config === null || key === null) return null;
  return createClient<Database>(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
