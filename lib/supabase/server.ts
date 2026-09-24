import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { supabasePublicConfig } from './env';

export type KavrixClient = SupabaseClient<Database>;

/**
 * A Supabase client acting as the signed-in user, for server components,
 * server actions and route handlers. Every query it makes runs under RLS.
 *
 * Returns `null` when this deployment has no Supabase configured.
 */
export async function createSupabaseServerClient(): Promise<KavrixClient | null> {
  const config = supabasePublicConfig();
  if (config === null) return null;
  const store = await cookies();

  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (entries) => {
        try {
          for (const { name, value, options } of entries) store.set(name, value, options);
        } catch {
          // A server component cannot set cookies. The proxy refreshes the
          // session on every protected request, so nothing is lost here.
        }
      },
    },
  });
}
