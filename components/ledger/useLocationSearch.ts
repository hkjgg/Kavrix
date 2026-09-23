'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * The page's `location.search`, as React state.
 *
 * The Ledger is prerendered as static HTML, so the server always renders the
 * default view (its snapshot is `''`) and the browser swaps in the linked
 * view as it hydrates — no hydration mismatch, no Suspense fallback, and the
 * prerendered page is the real table rather than a placeholder.
 *
 * Writes go through `history.replaceState`: changing a filter is not a
 * navigation, and the Back button should leave the Ledger, not undo a filter.
 * Next keeps its router in step with native history calls.
 */

const CHANGE_EVENT = 'kavrix:locationsearch';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): string {
  return window.location.search;
}

function getServerSnapshot(): string {
  return '';
}

export function useLocationSearch(): [string, (search: string) => void] {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const replace = useCallback((next: string) => {
    const url = `${window.location.pathname}${next === '' ? '' : `?${next}`}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [search, replace];
}
