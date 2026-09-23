import { describe, expect, it } from 'vitest';
import type { KeyContext } from './keyboard';
import { ledgerKeyAction } from './keyboard';

const base: KeyContext = {
  target: 'other',
  selectedIndex: null,
  total: 220,
  search: '',
  singleMatchId: null,
  dialogOpen: false,
};
const press = (key: string, context: Partial<KeyContext> = {}, modifiers = {}) =>
  ledgerKeyAction({ key, ...modifiers }, { ...base, ...context });

describe('ledgerKeyAction — moving the selection', () => {
  it('starts at the top on the first arrow', () => {
    expect(press('ArrowDown')).toEqual({ type: 'select', index: 0 });
    expect(press('ArrowUp')).toEqual({ type: 'select', index: 0 });
  });

  it('moves one row and stops at either end', () => {
    expect(press('ArrowDown', { selectedIndex: 4 })).toEqual({ type: 'select', index: 5 });
    expect(press('ArrowUp', { selectedIndex: 4 })).toEqual({ type: 'select', index: 3 });
    expect(press('ArrowDown', { selectedIndex: 219 })).toEqual({ type: 'select', index: 219 });
    expect(press('ArrowUp', { selectedIndex: 0 })).toEqual({ type: 'select', index: 0 });
  });

  it('jumps to the first and last row of the whole filter, not the page', () => {
    expect(press('Home', { selectedIndex: 120 })).toEqual({ type: 'select', index: 0 });
    expect(press('End', { selectedIndex: 3 })).toEqual({ type: 'select', index: 219 });
  });

  it('does nothing in an empty filter', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) expect(press(key, { total: 0 })).toBeNull();
  });

  it('works while a row link has focus, where Enter is the link’s own', () => {
    expect(press('ArrowDown', { target: 'control', selectedIndex: 2 })).toEqual({ type: 'select', index: 3 });
    expect(press('Enter', { target: 'control', selectedIndex: 2 })).toBeNull();
  });
});

describe('ledgerKeyAction — opening and focus', () => {
  it('opens the selected row with Enter', () => {
    expect(press('Enter', { selectedIndex: 7 })).toEqual({ type: 'open', index: 7 });
    expect(press('Enter')).toBeNull();
  });

  it('focuses the search with / and returns to the table with Esc', () => {
    expect(press('/')).toEqual({ type: 'focus-search' });
    expect(press('Escape')).toEqual({ type: 'focus-table' });
    expect(press('?')).toEqual({ type: 'help' });
  });
});

describe('ledgerKeyAction — never hijacks typing', () => {
  it('lets the search field keep every character', () => {
    for (const key of ['/', '?', '7', 'Home', 'End', 'ArrowUp', 'a', ' ']) {
      expect(press(key, { target: 'search', search: '70' })).toBeNull();
    }
  });

  it('clears the search on Esc, then returns to the table on the next', () => {
    expect(press('Escape', { target: 'search', search: '7007' })).toEqual({ type: 'clear-search' });
    expect(press('Escape', { target: 'search', search: '' })).toEqual({ type: 'focus-table' });
  });

  it('opens the one matching Dossier with Enter, and only when exactly one matches', () => {
    expect(press('Enter', { target: 'search', search: '700766', singleMatchId: 'T-700766' })).toEqual({
      type: 'open-match',
      id: 'T-700766',
    });
    expect(press('Enter', { target: 'search', search: '7007' })).toBeNull();
  });

  it('steps from the search into the results with ↓', () => {
    expect(press('ArrowDown', { target: 'search', search: '7007' })).toEqual({ type: 'select', index: 0 });
  });

  it('leaves every other field alone except for Esc', () => {
    for (const key of ['/', '?', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']) {
      expect(press(key, { target: 'field' })).toBeNull();
    }
    expect(press('Escape', { target: 'field' })).toEqual({ type: 'focus-table' });
  });

  it('leaves Ctrl, ⌘ and Alt combinations to the browser', () => {
    expect(press('ArrowDown', {}, { ctrlKey: true })).toBeNull();
    expect(press('/', {}, { metaKey: true })).toBeNull();
    expect(press('End', {}, { altKey: true })).toBeNull();
  });

  it('stands aside while the shortcuts dialog is open', () => {
    expect(press('ArrowDown', { dialogOpen: true })).toBeNull();
    expect(press('Escape', { dialogOpen: true })).toBeNull();
  });
});
