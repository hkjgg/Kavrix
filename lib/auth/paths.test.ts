import { describe, expect, it } from 'vitest';
import { HOME_PATH, isAuthPath, isProtectedPath, safeNextPath } from './paths';

describe('auth paths', () => {
  it('protects the app surfaces and nothing public', () => {
    for (const path of ['/assay', '/ledger', '/ledger?x', '/trade/T-1', '/vault', '/constellation', '/wrapped/2026-08', '/settings']) {
      expect(isProtectedPath(path.split('?')[0]!), path).toBe(true);
    }
    for (const path of ['/demo', '/demo/ledger', '/demo/trade/T-1', '/verify/123456', '/login', '/api/ingest', '/', '/ledgers']) {
      expect(isProtectedPath(path), path).toBe(false);
    }
  });

  it('knows the auth pages', () => {
    expect(isAuthPath('/login')).toBe(true);
    expect(isAuthPath('/signup')).toBe(true);
    expect(isAuthPath('/demo')).toBe(false);
  });

  it('only redirects to paths on this site', () => {
    expect(safeNextPath('/ledger?source=manual')).toBe('/ledger?source=manual');
    expect(safeNextPath(null)).toBe(HOME_PATH);
    expect(safeNextPath('')).toBe(HOME_PATH);
    expect(safeNextPath('https://evil.test')).toBe(HOME_PATH);
    expect(safeNextPath('//evil.test')).toBe(HOME_PATH);
    expect(safeNextPath('/\\evil.test')).toBe(HOME_PATH);
    expect(safeNextPath('/x\n')).toBe(HOME_PATH);
  });
});
