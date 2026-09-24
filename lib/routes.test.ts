import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PrimaryNav, navItems } from '@/components/app/PrimaryNav';
import { APP_ROUTES, DEMO_ROUTES } from './routes';

describe('surface routes', () => {
  it('keeps the demo under /demo and the app at the root', () => {
    expect(DEMO_ROUTES.assay).toBe('/demo');
    expect(DEMO_ROUTES.trade('T-1')).toBe('/demo/trade/T-1');
    expect(DEMO_ROUTES.vaultDay('2026-08-13')).toBe('/demo/vault?day=2026-08-13');
    expect(DEMO_ROUTES.ledgerSource(1003)).toBe('/demo/ledger?source=1003');
    expect(DEMO_ROUTES.wrappedMonth('2026-08')).toBe('/demo/wrapped/2026-08');
    expect(DEMO_ROUTES.settings).toBeNull();
    expect(APP_ROUTES.assay).toBe('/assay');
    expect(APP_ROUTES.trade('T-1')).toBe('/trade/T-1');
    expect(APP_ROUTES.settings).toBe('/settings');
  });

  it('serves the demo certificate publicly and a trader’s own through their session', () => {
    expect(DEMO_ROUTES.certificate('2026-08', 'post')).toBe('/api/certificate?month=2026-08&format=post');
    expect(APP_ROUTES.certificate('2026-08', 'story')).toBe('/api/certificate?month=2026-08&format=story&source=account');
  });

  it('gives a real account Settings and the demo none', () => {
    expect(navItems('demo').map((item) => item.key)).toEqual(['assay', 'ledger', 'vault', 'constellation', 'wrapped']);
    expect(navItems('app').map((item) => item.key)).toContain('settings');
    const markup = renderToStaticMarkup(createElement(PrimaryNav, { current: 'settings', surface: 'app' }));
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/settings"/);
    expect(markup).not.toContain('/demo');
  });
});
