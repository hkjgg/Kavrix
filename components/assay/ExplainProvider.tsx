'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ExplainEntry, ExplainIndex } from './explain-types';
import { ExplainDrawer } from './ExplainDrawer';

interface ExplainContextValue {
  open: (id: string) => void;
  close: () => void;
  has: (id: string) => boolean;
  openId: string | null;
}

const ExplainContext = createContext<ExplainContextValue | null>(null);

export function useExplain(): ExplainContextValue {
  const value = useContext(ExplainContext);
  if (value === null) {
    throw new Error('useExplain must be used inside an ExplainProvider');
  }
  return value;
}

export interface ExplainProviderProps {
  /** Built server-side from the AssayResult, so the client never sees a trade. */
  index: ExplainIndex;
  children: ReactNode;
}

/**
 * Holds the explanations and the one drawer that shows them.
 *
 * The page stays a server component: only this provider, the buttons and the
 * drawer are client code, and `children` is server-rendered markup passed
 * straight through.
 */
export function ExplainProvider({ index, children }: ExplainProviderProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const open = useCallback((id: string) => {
    setOpenId(id);
  }, []);
  const close = useCallback(() => {
    setOpenId(null);
  }, []);
  const has = useCallback((id: string) => index[id] !== undefined, [index]);

  const value = useMemo<ExplainContextValue>(
    () => ({ open, close, has, openId }),
    [open, close, has, openId],
  );

  const entry: ExplainEntry | null = openId === null ? null : (index[openId] ?? null);

  return (
    <ExplainContext.Provider value={value}>
      {children}
      <ExplainDrawer entry={entry} onClose={close} />
    </ExplainContext.Provider>
  );
}
