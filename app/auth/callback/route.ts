import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { LOGIN_PATH, safeNextPath } from '@/lib/auth/paths';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * `GET /auth/callback` — where a magic link or a confirmation email lands.
 * Either a PKCE `code` or a `token_hash` + `type` is exchanged for a session
 * (set as cookies), then the reader goes on to `next` — a path on this site,
 * never another origin.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();
  if (supabase !== null) {
    if (code !== null) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error === null) return NextResponse.redirect(new URL(next, url.origin));
    } else if (tokenHash !== null && type !== null) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error === null) return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL(`${LOGIN_PATH}?error=link`, url.origin));
}
