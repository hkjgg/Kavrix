/**
 * Demo economic calendar — high-impact USD releases (CLAUDE.md §11).
 *
 * A fixed, hand-written list covering the 90-day demo window, placed on the
 * weekdays and times the real releases use (08:30 ET = 12:30 UTC,
 * 10:00 ET = 14:00 UTC, FOMC 14:00 ET = 18:00 UTC). It is demo data, not a
 * feed: real accounts get this from the MT5 built-in calendar through the
 * Kavrix Connector (CLAUDE.md §12).
 *
 * Only `high` events open a news window for the engine (CLAUDE.md §5). The
 * weekly jobless claims are here at `medium` so the calendar reads like a
 * real one without widening those windows.
 *
 * Deliberately, no high-impact release lands between 07:00 and 10:00 UTC —
 * that is how the real USD calendar behaves, and it is what leaves the London
 * open clean in the demo story.
 */

import type { NewsEvent } from '@/lib/engine/types';

interface DemoEventSpec {
  /** UTC date, `YYYY-MM-DD`. */
  date: string;
  /** UTC time of day, `HH:MM`. */
  time: string;
  importance: NewsEvent['importance'];
  name: string;
}

/** Base for synthetic event ids. 840 is the ISO 4217 numeric code for USD. */
const EVENT_ID_BASE = 840_000_000;

/**
 * The releases, in chronological order. Window: 2026-06-22 → 2026-09-19.
 * Weekdays are real: NFP sits on the first Friday, CPI mid-month, FOMC on a
 * Wednesday.
 */
const DEMO_EVENT_SPECS: readonly DemoEventSpec[] = [
  // June
  { date: '2026-06-23', time: '14:00', importance: 'high', name: 'CB Consumer Confidence' },
  { date: '2026-06-25', time: '12:30', importance: 'medium', name: 'Unemployment Claims' },
  { date: '2026-06-25', time: '12:30', importance: 'high', name: 'Final GDP q/q' },
  { date: '2026-06-26', time: '12:30', importance: 'high', name: 'Core PCE Price Index m/m' },
  { date: '2026-06-30', time: '13:45', importance: 'medium', name: 'Chicago PMI' },

  // July
  { date: '2026-07-01', time: '12:15', importance: 'high', name: 'ADP Non-Farm Employment Change' },
  { date: '2026-07-01', time: '14:00', importance: 'high', name: 'ISM Manufacturing PMI' },
  { date: '2026-07-02', time: '12:30', importance: 'medium', name: 'Unemployment Claims' },
  { date: '2026-07-03', time: '12:30', importance: 'high', name: 'Non-Farm Employment Change' },
  { date: '2026-07-06', time: '14:00', importance: 'high', name: 'ISM Services PMI' },
  { date: '2026-07-09', time: '12:30', importance: 'medium', name: 'Unemployment Claims' },
  { date: '2026-07-14', time: '12:30', importance: 'high', name: 'Core CPI m/m' },
  { date: '2026-07-15', time: '12:30', importance: 'high', name: 'PPI m/m' },
  { date: '2026-07-16', time: '12:30', importance: 'high', name: 'Retail Sales m/m' },
  { date: '2026-07-17', time: '14:00', importance: 'high', name: 'Prelim UoM Consumer Sentiment' },
  { date: '2026-07-22', time: '18:00', importance: 'high', name: 'FOMC Meeting Minutes' },
  { date: '2026-07-23', time: '12:30', importance: 'medium', name: 'Unemployment Claims' },
  { date: '2026-07-29', time: '18:00', importance: 'high', name: 'FOMC Statement and Rate Decision' },
  { date: '2026-07-29', time: '18:30', importance: 'high', name: 'FOMC Press Conference' },
  { date: '2026-07-30', time: '12:30', importance: 'high', name: 'Advance GDP q/q' },
  { date: '2026-07-31', time: '12:30', importance: 'high', name: 'Core PCE Price Index m/m' },

  // August
  { date: '2026-08-03', time: '14:00', importance: 'high', name: 'ISM Manufacturing PMI' },
  { date: '2026-08-05', time: '12:15', importance: 'high', name: 'ADP Non-Farm Employment Change' },
  { date: '2026-08-05', time: '14:00', importance: 'high', name: 'ISM Services PMI' },
  { date: '2026-08-06', time: '12:30', importance: 'medium', name: 'Unemployment Claims' },
  { date: '2026-08-07', time: '12:30', importance: 'high', name: 'Non-Farm Employment Change' },
  { date: '2026-08-12', time: '12:30', importance: 'high', name: 'Core CPI m/m' },
  { date: '2026-08-13', time: '12:30', importance: 'high', name: 'PPI m/m' },
  { date: '2026-08-14', time: '12:30', importance: 'high', name: 'Retail Sales m/m' },
  { date: '2026-08-19', time: '18:00', importance: 'high', name: 'FOMC Meeting Minutes' },
  { date: '2026-08-20', time: '12:30', importance: 'medium', name: 'Unemployment Claims' },
  { date: '2026-08-21', time: '14:00', importance: 'high', name: 'Fed Chair Speech' },
  { date: '2026-08-27', time: '12:30', importance: 'high', name: 'Prelim GDP q/q' },
  { date: '2026-08-28', time: '12:30', importance: 'high', name: 'Core PCE Price Index m/m' },

  // September
  { date: '2026-09-01', time: '14:00', importance: 'high', name: 'ISM Manufacturing PMI' },
  { date: '2026-09-02', time: '12:15', importance: 'high', name: 'ADP Non-Farm Employment Change' },
  { date: '2026-09-03', time: '12:30', importance: 'medium', name: 'Unemployment Claims' },
  { date: '2026-09-03', time: '14:00', importance: 'high', name: 'ISM Services PMI' },
  { date: '2026-09-04', time: '12:30', importance: 'high', name: 'Non-Farm Employment Change' },
  { date: '2026-09-10', time: '12:30', importance: 'high', name: 'Core CPI m/m' },
  { date: '2026-09-11', time: '12:30', importance: 'high', name: 'PPI m/m' },
  { date: '2026-09-15', time: '12:30', importance: 'high', name: 'Retail Sales m/m' },
  { date: '2026-09-16', time: '18:00', importance: 'high', name: 'FOMC Statement and Rate Decision' },
  { date: '2026-09-16', time: '18:30', importance: 'high', name: 'FOMC Press Conference' },
  { date: '2026-09-18', time: '14:00', importance: 'high', name: 'Prelim UoM Consumer Sentiment' },
];

/** Builds the demo calendar, sorted by time, with stable synthetic event ids. */
export function buildDemoCalendar(): NewsEvent[] {
  return DEMO_EVENT_SPECS.map((spec, index) => ({
    eventId: EVENT_ID_BASE + index,
    time: `${spec.date}T${spec.time}:00.000Z`,
    currency: 'USD',
    importance: spec.importance,
    name: spec.name,
  })).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

/** The high-impact subset — the only events that open a news window (§5). */
export function highImpactEvents(calendar: readonly NewsEvent[]): NewsEvent[] {
  return calendar.filter((event) => event.importance === 'high');
}
