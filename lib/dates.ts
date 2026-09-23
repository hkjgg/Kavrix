/**
 * Calendar words for UTC day keys (`YYYY-MM-DD`), in English, without `Intl`.
 *
 * Browser-safe and locale-proof: the Vault and the Purity Line print the same
 * dates on the server and in any browser, so a prerendered page never
 * disagrees with itself on hydration.
 */

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Monday first — the Vault's columns, and ISO weeks. */
export const WEEKDAYS_MONDAY_FIRST = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const DAY_MS = 86_400_000;

/** `2026-07-15` → midnight UTC that day. */
export function dayKeyMs(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`);
}

/** Midnight UTC → `2026-07-15`. */
export function msDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `2026-07-15`, +3 → `2026-07-18`. */
export function addDays(key: string, days: number): string {
  return msDayKey(dayKeyMs(key) + days * DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function mondayIndex(key: string): number {
  return (new Date(dayKeyMs(key)).getUTCDay() + 6) % 7;
}

/** `2026-07-15` → `15 Jul`. */
export function shortDate(key: string): string {
  const month = MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? '';
  return `${Number(key.slice(8, 10))} ${month.slice(0, 3)}`;
}

/** `2026-07-15` → `Wed 15 Jul`. */
export function shortWeekdayDate(key: string): string {
  return `${(WEEKDAYS_MONDAY_FIRST[mondayIndex(key)] ?? '').slice(0, 3)} ${shortDate(key)}`;
}

/** `2026-07-15` → `Wednesday 15 July 2026`. */
export function longDate(key: string): string {
  const month = MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? '';
  return `${WEEKDAYS_MONDAY_FIRST[mondayIndex(key)] ?? ''} ${Number(key.slice(8, 10))} ${month} ${key.slice(0, 4)}`;
}

/** `2026-07` → `July 2026`. */
export function monthLabel(monthKey: string): string {
  return `${MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1] ?? ''} ${monthKey.slice(0, 4)}`;
}

/** An ISO instant → `12:16`, UTC. */
export function utcClock(iso: string): string {
  return iso.slice(11, 16);
}
