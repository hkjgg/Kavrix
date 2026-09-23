/**
 * The Ledger's vocabulary (CLAUDE.md §10): what each impurity and session is
 * called on screen, in one place.
 *
 * Types only from the engine, so this module is safe to ship to the browser —
 * the Ledger's filters and the CSV export read the same words the Explain
 * drawer and the Dossier print.
 */

import type { ImpurityKind, SessionKey } from '@/lib/engine/enrich';

/** Every impurity the engine can flag, in the order the engine flags them. */
export const IMPURITY_KINDS: readonly ImpurityKind[] = [
  'revenge',
  'news',
  'rollover',
  'oversized',
  'noStop',
  'stopWidened',
  'exitOverrun',
];

export const IMPURITY_LABELS: Record<ImpurityKind, string> = {
  revenge: 'Revenge',
  news: 'News window',
  rollover: 'Rollover',
  oversized: 'Oversized',
  noStop: 'No stop',
  stopWidened: 'Stop widened',
  exitOverrun: 'Exit overrun',
};

export const SESSION_KEYS: readonly SessionKey[] = ['asia', 'london', 'newYork'];

export const SESSION_LABELS: Record<SessionKey, string> = {
  asia: 'Asia',
  london: 'London',
  newYork: 'New York',
};

/** Hours no session in §5 covers (21:00–00:00 UTC). */
export const NO_SESSION_LABEL = 'Off-session';

/** `London · New York`, or `Off-session` when the entry fell in none. */
export function sessionsLabel(sessions: readonly SessionKey[]): string {
  if (sessions.length === 0) return NO_SESSION_LABEL;
  return sessions.map((session) => SESSION_LABELS[session]).join(' · ');
}
