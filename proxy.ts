import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { HOME_PATH, LOGIN_PATH, isAuthPath, isProtectedPath } from '@/lib/auth/paths';
import { supabasePublicConfig } from '@/lib/supabase/env';

/**
 * The session gate (Next 16's `proxy`, formerly middleware).
 *
 * Runs only on the app's own surfaces and the two auth pages — never on
 * `/demo`, which stays static, public and instant (CLAUDE.md §11). It
 * refreshes the Supabase session cookies, sends a visitor without a session
 * to `/login?next=…`, and sends a signed-in trader away from the auth pages.
 * The pages check again and every query runs under RLS, so this is the
 * doorman, not the lock.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = supabasePublicConfig();

  const toLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(url);
  };

  if (config === null) return isProtectedPath(pathname) ? toLogin() : NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (entries) => {
        for (const { name, value } of entries) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of entries) response.cookies.set(name, value, options);
      },
    },
  });

  // `getUser` asks the auth server, so a forged or revoked cookie fails here.
  const { data } = await supabase.auth.getUser();
  const signedIn = data.user !== null;

  if (!signedIn && isProtectedPath(pathname)) return toLogin();
  if (signedIn && isAuthPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = HOME_PATH;
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    '/assay/:path*',
    '/ledger/:path*',
    '/trade/:path*',
    '/vault/:path*',
    '/constellation/:path*',
    '/wrapped/:path*',
    '/settings/:path*',
    '/login',
    '/signup',
  ],
};
