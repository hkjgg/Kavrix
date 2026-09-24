'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { Surface, SurfaceRoutes } from '@/lib/routes';
import { routesFor } from '@/lib/routes';

/**
 * Which surface a client component is drawn on — the demo or a real account —
 * so the links it prints go to the right place. The shell provides it; the
 * default is the demo, which is what every surface drew before Stage 8.
 */

const SurfaceContext = createContext<Surface>('demo');

export function SurfaceProvider({ surface, children }: { surface: Surface; children: ReactNode }) {
  return <SurfaceContext.Provider value={surface}>{children}</SurfaceContext.Provider>;
}

export function useRoutes(): SurfaceRoutes {
  return routesFor(useContext(SurfaceContext));
}
