/**
 * The demo account's Wrapped, one month at a time (CLAUDE.md §17 Stage 7).
 *
 * Each month is assayed the way a real account's would be: `runEngine` as of
 * the month's last millisecond — or of the data, for the month still running —
 * then the engine's own `buildWrapped`. So August's Proof and Constellation
 * are the ones that stood on 31 August, not the ones that stand today.
 *
 * `asOf` is the end of the demo window, never the clock (see `assay.ts`).
 */

import type { WrappedView } from '@/components/wrapped/wrapped';
import type { MonthKey, WrappedResult } from '@/lib/engine';
import { certificateSerial, defaultWrappedMonth, isMonthKey, wrappedMonths } from '@/lib/engine';
import { wrappedForMonth, wrappedView } from '@/lib/views/account';
import { getDemoAssay, getDemoDataset } from './assay';
import { DEMO_END_MS } from './generate';

const cache = new Map<MonthKey, WrappedResult>();
let cachedMonths: MonthKey[] | null = null;

/** Every month the demo history touches, oldest first. */
export function getDemoWrappedMonths(): MonthKey[] {
  if (cachedMonths === null) cachedMonths = wrappedMonths(getDemoAssay().trades, DEMO_END_MS);
  return cachedMonths;
}

/** The month `/wrapped` opens on: the last full month. */
export function getDemoDefaultMonth(): MonthKey {
  const months = getDemoWrappedMonths();
  return defaultWrappedMonth(months, DEMO_END_MS) ?? months[0] ?? '2026-08';
}

export function isDemoMonth(month: string): boolean {
  return isMonthKey(month) && getDemoWrappedMonths().includes(month);
}

export function getDemoWrapped(month: MonthKey): WrappedResult {
  const hit = cache.get(month);
  if (hit !== undefined) return hit;
  if (!isDemoMonth(month)) throw new RangeError(`no demo month ${month}`);

  const wrapped = wrappedForMonth(month, getDemoDataset(), {}, DEMO_END_MS, true);
  cache.set(month, wrapped);
  return wrapped;
}

const views = new Map<MonthKey, WrappedView>();

/** The month as the page draws it. */
export function getDemoWrappedView(month: MonthKey): WrappedView {
  const hit = views.get(month);
  if (hit !== undefined) return hit;
  const view = wrappedView(getDemoWrapped(month), getDemoWrappedMonths(), DEMO_END_MS, getDemoDataset().account.currency);
  views.set(month, view);
  return view;
}

/** The demo month a certificate serial was issued for, or `null` (`/verify/[serial]`). */
export function demoMonthForSerial(serial: string): MonthKey | null {
  const { account } = getDemoDataset();
  return getDemoWrappedMonths().find((month) => certificateSerial(account, month, { demo: true }) === serial) ?? null;
}
