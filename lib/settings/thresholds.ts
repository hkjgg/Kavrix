/**
 * The thresholds a trader may set in Settings (CLAUDE.md §6.1), validated.
 * The bounds are the database's own checks, so a value that passes here is
 * one Postgres will store. Pure and browser-safe.
 */

import { z } from 'zod';
import { DEFAULT_SETTINGS } from '@/lib/engine/settings';

export const THRESHOLD_BOUNDS = {
  riskLimitPercent: { min: 0.05, max: 10, step: 0.05 },
  dailyMaxTrades: { min: 1, max: 100, step: 1 },
  newsWindowMinutes: { min: 0, max: 240, step: 1 },
  rolloverWindowMinutes: { min: 0, max: 240, step: 1 },
  serverUtcOffsetHours: { min: -12, max: 14, step: 0.5 },
} as const;

const number = (message: string) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value), z.number({ message }));

export const thresholdsSchema = z.object({
  riskLimitPercent: number('Enter the risk limit as a number.')
    .pipe(z.number().min(THRESHOLD_BOUNDS.riskLimitPercent.min, 'The risk limit must be at least 0.05%.').max(10, 'The risk limit can be at most 10%.')),
  dailyMaxTrades: number('Enter the daily maximum as a whole number.')
    .pipe(z.number().int('Use a whole number of trades.').min(1, 'Allow at least one trade a day.').max(100, 'At most 100 trades a day.')),
  newsWindowMinutes: number('Enter the news window in minutes.')
    .pipe(z.number().int('Use whole minutes.').min(0, 'The news window cannot be negative.').max(240, 'At most 240 minutes.')),
  rolloverWindowMinutes: number('Enter the rollover window in minutes.')
    .pipe(z.number().int('Use whole minutes.').min(0, 'The rollover window cannot be negative.').max(240, 'At most 240 minutes.')),
  serverUtcOffsetHours: number('Enter the broker offset in hours.')
    .pipe(
      z
        .number()
        .min(-12, 'Offsets run from −12 to +14 hours.')
        .max(14, 'Offsets run from −12 to +14 hours.')
        .refine((value) => Number.isInteger(value * 2), 'Use whole or half hours.'),
    ),
});

export type Thresholds = z.infer<typeof thresholdsSchema>;

export const DEFAULT_THRESHOLDS: Thresholds = {
  riskLimitPercent: DEFAULT_SETTINGS.riskLimitPercent,
  dailyMaxTrades: DEFAULT_SETTINGS.dailyMaxTrades,
  newsWindowMinutes: DEFAULT_SETTINGS.newsWindowMinutes,
  rolloverWindowMinutes: DEFAULT_SETTINGS.rolloverWindowMinutes,
  serverUtcOffsetHours: DEFAULT_SETTINGS.serverUtcOffsetHours,
};

/** Form fields → a validated set of thresholds, or the first problem in words. */
export function parseThresholds(input: Record<string, unknown>): { ok: true; value: Thresholds } | { ok: false; error: string } {
  const parsed = thresholdsSchema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
}

/** Thresholds → the `settings` row's columns. */
export function thresholdsToRow(value: Thresholds) {
  return {
    risk_limit_percent: value.riskLimitPercent,
    daily_max_trades: value.dailyMaxTrades,
    news_window_minutes: value.newsWindowMinutes,
    rollover_window_minutes: value.rolloverWindowMinutes,
    server_utc_offset_hours: value.serverUtcOffsetHours,
  };
}

export const tokenNameSchema = z
  .string()
  .trim()
  .min(1, 'Name the token — the terminal it is for, say.')
  .max(60, 'Keep the name under 60 characters.');
