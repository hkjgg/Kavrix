/**
 * Kavrix number formatting.
 *
 * Every number the user sees goes through this file (CLAUDE.md §16) so that
 * decimals, signs and spacing are identical everywhere. Two house rules:
 *
 *  - Negative numbers use a real minus sign (U+2212), never a hyphen.
 *  - Values are rendered with fixed decimals so mono columns line up.
 */

/** U+2212 MINUS SIGN — typographically correct, and the same width as "+". */
export const MINUS = '−';

/** Placeholder shown wherever a value is not a finite number. */
export const EM_DASH = '—';

/**
 * Rounds to `digits` decimals and returns the absolute value as a string,
 * plus the sign of the *rounded* number. Rounding first means −0.004 at one
 * decimal reads "0.0R" rather than "−0.0R".
 */
function splitSign(
  value: number,
  digits: number,
): { negative: boolean; abs: string } {
  const rounded = Number(value.toFixed(digits));
  const normalized = rounded === 0 ? 0 : rounded;
  return {
    negative: normalized < 0,
    abs: Math.abs(normalized).toFixed(digits),
  };
}

function signPrefix(negative: boolean, zero: boolean, signed: boolean): string {
  if (negative) return MINUS;
  if (signed && !zero) return '+';
  return '';
}

export interface FormatROptions {
  /** Decimal places. Default 1 — R is always reported to one decimal. */
  digits?: number;
  /** Show a leading "+" on positive values. Default true. */
  signed?: boolean;
}

/**
 * R-multiple: `formatR(1.8)` → `"+1.8R"`, `formatR(-0.6)` → `"−0.6R"`.
 * Zero is unsigned: `"0.0R"`.
 */
export function formatR(value: number, options: FormatROptions = {}): string {
  const { digits = 1, signed = true } = options;
  if (!Number.isFinite(value)) return EM_DASH;

  const { negative, abs } = splitSign(value, digits);
  const zero = Number(abs) === 0;
  return `${signPrefix(negative, zero, signed)}${abs}R`;
}

export interface FormatMoneyOptions {
  /** ISO 4217 code. Default "USD". */
  currency?: string;
  /** Decimal places. Default 2. */
  digits?: number;
  /** Show a leading "+" on positive values. Default false. */
  signed?: boolean;
  /** Locale used for grouping separators. Default "en-US". */
  locale?: string;
}

/**
 * Account currency: `formatMoney(1234.5)` → `"$1,234.50"`,
 * `formatMoney(-820)` → `"−$820.00"`.
 *
 * The sign sits outside the symbol, which is what a bank statement does and
 * what keeps a column of figures readable.
 */
export function formatMoney(
  value: number,
  options: FormatMoneyOptions = {},
): string {
  const {
    currency = 'USD',
    digits = 2,
    signed = false,
    locale = 'en-US',
  } = options;
  if (!Number.isFinite(value)) return EM_DASH;

  const rounded = Number(value.toFixed(digits));
  const negative = rounded < 0;
  const zero = rounded === 0;

  const body = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(rounded));

  return `${signPrefix(negative, zero, signed)}${body}`;
}

export interface FormatPctOptions {
  /** Decimal places. Default 1. */
  digits?: number;
  /** Show a leading "+" on positive values. Default false. */
  signed?: boolean;
  /**
   * Set when the input is a ratio (0.0125) rather than a percentage (1.25).
   * Default false — the engine reports risk% as a percentage already.
   */
  fromRatio?: boolean;
}

/** Percentage: `formatPct(1.25)` → `"1.3%"`, `formatPct(0.0125, { fromRatio: true })` → `"1.3%"`. */
export function formatPct(value: number, options: FormatPctOptions = {}): string {
  const { digits = 1, signed = false, fromRatio = false } = options;
  if (!Number.isFinite(value)) return EM_DASH;

  const scaled = fromRatio ? value * 100 : value;
  const { negative, abs } = splitSign(scaled, digits);
  const zero = Number(abs) === 0;
  return `${signPrefix(negative, zero, signed)}${abs}%`;
}

export interface FormatKaratOptions {
  /** Decimal places. Default 1 (CLAUDE.md §6.1). */
  digits?: number;
  /** Show a leading "+" — use for a delta, not for a score. Default false. */
  signed?: boolean;
}

/**
 * Karat score: `formatKarat(21.35)` → `"21.4K"`.
 * With `signed` it renders a week-over-week delta: `formatKarat(-1.2, { signed: true })` → `"−1.2K"`.
 */
export function formatKarat(
  value: number,
  options: FormatKaratOptions = {},
): string {
  const { digits = 1, signed = false } = options;
  if (!Number.isFinite(value)) return EM_DASH;

  const { negative, abs } = splitSign(value, digits);
  const zero = Number(abs) === 0;
  return `${signPrefix(negative, zero, signed)}${abs}K`;
}

export interface FormatDurationOptions {
  /** Units shown, largest first. Default 2 — `1h 24m`, never `1h 24m 12s`. */
  units?: number;
}

/**
 * Holding time: `formatDuration(84)` → `"1m"`, `formatDuration(5040)` →
 * `"1h 24m"`, `formatDuration(183_600)` → `"2d 3h"`.
 *
 * Truncated, not rounded: a trade held 59 minutes was not held an hour.
 * Anything under a minute reads in seconds.
 */
export function formatDuration(
  seconds: number,
  options: FormatDurationOptions = {},
): string {
  const { units = 2 } = options;
  if (!Number.isFinite(seconds) || seconds < 0) return EM_DASH;

  const whole = Math.floor(seconds);
  if (whole < 60) return `${whole}s`;

  const parts: Array<[number, string]> = [
    [Math.floor(whole / 86_400), 'd'],
    [Math.floor((whole % 86_400) / 3_600), 'h'],
    [Math.floor((whole % 3_600) / 60), 'm'],
  ];
  const first = parts.findIndex(([value]) => value > 0);
  return parts
    .slice(first, first + units)
    .filter(([value], index) => index === 0 || value > 0)
    .map(([value, unit]) => `${value}${unit}`)
    .join(' ');
}

/** Lots, always two decimals: `formatLots(0.5)` → `"0.50"`. */
export function formatLots(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH;
  return Math.abs(value).toFixed(2);
}

/** A price at the symbol's own precision: `formatPrice(2412.3, 2)` → `"2412.30"`. */
export function formatPrice(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return EM_DASH;
  const { negative, abs } = splitSign(value, digits);
  return `${negative ? MINUS : ''}${abs}`;
}
