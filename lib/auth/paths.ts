/**
 * Where a signed-in trader lands, and which paths need a session. Pure and
 * browser-safe: the proxy, the auth actions and the tests all read it.
 */

export const HOME_PATH = '/assay';
export const LOGIN_PATH = '/login';
export const SIGNUP_PATH = '/signup';

/** The app's own surfaces (CLAUDE.md §15). `/demo`, `/verify` and the APIs are not here. */
export const PROTECTED_PREFIXES = [
  '/assay',
  '/ledger',
  '/trade',
  '/vault',
  '/constellation',
  '/wrapped',
  '/settings',
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isAuthPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === SIGNUP_PATH;
}

/**
 * A `next` parameter made safe to redirect to: a path on this site, never
 * another origin (`//evil.test`, `https://…`, `/\evil.test`). Anything else
 * becomes the Assay.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== 'string' || next === '') return HOME_PATH;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return HOME_PATH;
  if (/[\u0000-\u001f]/.test(next)) return HOME_PATH;
  return next;
}
