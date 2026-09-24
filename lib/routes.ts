/**
 * Where each surface lives, for the demo and for a signed-in trader.
 *
 * The demo is public and prerendered under `/demo/*`; the same surfaces for a
 * real account live at the root and require a session (CLAUDE.md §11, §15).
 * One component tree draws both, so every link a surface prints is taken from
 * here rather than written into the component. Browser-safe.
 */

export type Surface = 'demo' | 'app';

export type CertificateFormatKey = 'post' | 'story';

export interface SurfaceRoutes {
  surface: Surface;
  assay: string;
  ledger: string;
  vault: string;
  constellation: string;
  wrapped: string;
  /** Settings exist only for a real account. */
  settings: string | null;
  trade(id: string): string;
  wrappedMonth(month: string): string;
  vaultDay(date: string): string;
  ledgerSource(source: string | number): string;
  certificate(month: string, format: CertificateFormatKey): string;
}

function build(surface: Surface): SurfaceRoutes {
  const base = surface === 'demo' ? '/demo' : '';
  return {
    surface,
    assay: surface === 'demo' ? '/demo' : '/assay',
    ledger: `${base}/ledger`,
    vault: `${base}/vault`,
    constellation: `${base}/constellation`,
    wrapped: `${base}/wrapped`,
    settings: surface === 'demo' ? null : '/settings',
    trade: (id) => `${base}/trade/${encodeURIComponent(id)}`,
    wrappedMonth: (month) => `${base}/wrapped/${month}`,
    vaultDay: (date) => `${base}/vault?day=${date}`,
    ledgerSource: (source) => `${base}/ledger?source=${encodeURIComponent(String(source))}`,
    certificate: (month, format) =>
      `/api/certificate?month=${month}&format=${format}${surface === 'app' ? '&source=account' : ''}`,
  };
}

export const DEMO_ROUTES: SurfaceRoutes = build('demo');
export const APP_ROUTES: SurfaceRoutes = build('app');

export function routesFor(surface: Surface): SurfaceRoutes {
  return surface === 'demo' ? DEMO_ROUTES : APP_ROUTES;
}
