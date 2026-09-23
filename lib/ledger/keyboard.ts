/**
 * The Ledger's keyboard (Stage 4) — a terminal feel, decided in one pure
 * function so it can be tested without a browser.
 *
 *   ↑ / ↓        move the selected row
 *   Home / End   first / last row of the current filter
 *   Enter        open the selected row's Dossier
 *   /            focus the ticket search
 *   Esc          clear the search, or return focus to the table
 *   ?            the shortcuts list
 *
 * Typing is never hijacked: inside the search field only Enter, Esc and ↓
 * mean anything, and inside any other field only Esc does. A key held with
 * Ctrl, ⌘ or Alt belongs to the browser.
 */

/** Where the key was pressed. */
export type KeyTarget =
  /** The ticket search field. */
  | 'search'
  /** Any other input, select, textarea or editable element. */
  | 'field'
  /** A link or button — Enter already means something there. */
  | 'control'
  /** Anywhere else on the page. */
  | 'other';

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface KeyContext {
  target: KeyTarget;
  /** Index of the selected row in the current filter, `null` when none. */
  selectedIndex: number | null;
  /** Rows in the current filter, every page. */
  total: number;
  search: string;
  /** The one trade the search matches, when it matches exactly one. */
  singleMatchId: string | null;
  /** The shortcuts dialog is open — it handles its own keys. */
  dialogOpen: boolean;
}

export type LedgerKeyAction =
  | { type: 'select'; index: number }
  | { type: 'open'; index: number }
  | { type: 'open-match'; id: string }
  | { type: 'focus-search' }
  | { type: 'clear-search' }
  | { type: 'focus-table' }
  | { type: 'help' };

function move(context: KeyContext, step: 1 | -1): LedgerKeyAction | null {
  if (context.total === 0) return null;
  // Nothing selected yet: either arrow starts at the top, where the eye already is.
  if (context.selectedIndex === null) return { type: 'select', index: 0 };
  const index = Math.min(Math.max(context.selectedIndex + step, 0), context.total - 1);
  return { type: 'select', index };
}

/** What a key press does on the Ledger, or `null` to leave it to the browser. */
export function ledgerKeyAction(
  event: KeyEventLike,
  context: KeyContext,
): LedgerKeyAction | null {
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return null;
  if (context.dialogOpen) return null;

  const { key } = event;

  if (context.target === 'search') {
    if (key === 'Enter') {
      return context.singleMatchId === null ? null : { type: 'open-match', id: context.singleMatchId };
    }
    if (key === 'Escape') {
      return context.search !== '' ? { type: 'clear-search' } : { type: 'focus-table' };
    }
    if (key === 'ArrowDown') return move(context, 1);
    return null;
  }

  if (context.target === 'field') {
    return key === 'Escape' ? { type: 'focus-table' } : null;
  }

  switch (key) {
    case 'ArrowDown':
      return move(context, 1);
    case 'ArrowUp':
      return move(context, -1);
    case 'Home':
      return context.total === 0 ? null : { type: 'select', index: 0 };
    case 'End':
      return context.total === 0 ? null : { type: 'select', index: context.total - 1 };
    case 'Enter':
      if (context.target === 'control') return null; // the link or button handles it
      return context.selectedIndex === null ? null : { type: 'open', index: context.selectedIndex };
    case 'Escape':
      return { type: 'focus-table' };
    case '/':
      return { type: 'focus-search' };
    case '?':
      return { type: 'help' };
    default:
      return null;
  }
}

/** The shortcuts list, as the dialog prints it. */
export const LEDGER_SHORTCUTS: ReadonlyArray<{ keys: string[]; does: string }> = [
  { keys: ['↑', '↓'], does: 'Move the selected row' },
  { keys: ['Home', 'End'], does: 'First or last row of the current filter' },
  { keys: ['Enter'], does: 'Open the selected trade’s Dossier' },
  { keys: ['/'], does: 'Search by ticket or position id' },
  { keys: ['Enter'], does: 'In the search: open the Dossier when one trade matches' },
  { keys: ['Esc'], does: 'Clear the search, or return focus to the table' },
  { keys: ['?'], does: 'Show this list' },
];
