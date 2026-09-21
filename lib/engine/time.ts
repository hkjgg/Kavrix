/**
 * UTC time helpers for the engine.
 *
 * Two rules, both from CLAUDE.md §5:
 *
 *  - Sessions, news windows and calendar days are **UTC**. The engine never
 *    reads the host machine's time zone, so a report renders identically in
 *    Beirut and in New York.
 *  - The rollover window is **broker server time**, which is not UTC. It is
 *    passed in as an offset (`serverUtcOffsetHours`) rather than assumed.
 *
 * Nothing here calls `Date.now()`. "Now" always arrives as an explicit `asOf`.
 */

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** Epoch milliseconds from an ISO 8601 string. Throws on an unparseable one. */
export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`invalid ISO timestamp: ${iso}`);
  return ms;
}

/** ISO 8601 with a `Z` suffix, the only string form the engine emits. */
export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Accepts either form of "now" and normalizes it to epoch milliseconds. */
export function normalizeAsOf(asOf: string | number): number {
  return typeof asOf === 'number' ? asOf : toMs(asOf);
}

/** `YYYY-MM-DD` in UTC — the key every daily aggregate is grouped by. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Midnight UTC at the start of the day containing `ms`. */
export function dayStartMs(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** Midnight UTC that starts the day named by a `YYYY-MM-DD` key. */
export function dayKeyToMs(key: string): number {
  return toMs(`${key}T00:00:00.000Z`);
}

/** UTC hour of day as a whole number, 0–23. */
export function hourOfDay(ms: number): number {
  return new Date(ms).getUTCHours();
}

/** UTC hour of day including minutes, e.g. 12.5 for 12:30 — session maths needs the half hour. */
export function fractionalHourOfDay(ms: number): number {
  const date = new Date(ms);
  return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
}

/** UTC day of week, 0 = Sunday … 6 = Saturday. */
export function weekdayUtc(ms: number): number {
  return new Date(ms).getUTCDay();
}

/** Full weekday names, indexed by `weekdayUtc`. */
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Midnight UTC on the Monday that opens the ISO week containing `ms`. */
export function isoWeekStartMs(ms: number): number {
  const start = dayStartMs(ms);
  const day = new Date(start).getUTCDay();
  // Monday is day 1; Sunday (0) belongs to the week that started six days ago.
  const offsetDays = day === 0 ? 6 : day - 1;
  return start - offsetDays * DAY_MS;
}

/**
 * ISO-8601 week key, `YYYY-Www` (e.g. `2026-W38`).
 *
 * The year is the ISO week-numbering year, not the calendar year: 2027-01-01
 * falls in `2026-W53`, which is what makes these keys sort correctly across a
 * year boundary.
 */
export function isoWeekKey(ms: number): string {
  const monday = isoWeekStartMs(ms);
  // The Thursday of an ISO week is always in that week's numbering year.
  const thursday = new Date(monday + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstMonday = isoWeekStartMs(firstThursday.getTime());
  const week = Math.round((monday - firstMonday) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Minutes from `ms` to the nearest broker-server midnight.
 *
 * `serverUtcOffsetHours` shifts UTC into server time: a broker on UTC+3 sees
 * its midnight at 21:00 UTC, which is where Gold's rollover spread blows out.
 */
export function minutesFromServerMidnight(
  ms: number,
  serverUtcOffsetHours: number,
): number {
  const serverMs = ms + serverUtcOffsetHours * HOUR_MS;
  const sinceMidnight = ((serverMs % DAY_MS) + DAY_MS) % DAY_MS;
  const toMidnight = DAY_MS - sinceMidnight;
  return Math.min(sinceMidnight, toMidnight) / MINUTE_MS;
}
