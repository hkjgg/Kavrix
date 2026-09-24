/**
 * The Kavrix Connector cannot be compiled here (MetaEditor is Windows-only),
 * so these checks guard what can be checked from its source: that it is
 * read-only, that it stays pure ASCII (MetaEditor reads it without an
 * encoding guess), and that the JSON it builds uses exactly the §12 field
 * names the ingest schema validates.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountSchema, calendarSchema, dealSchema, modificationSchema, symbolInfoSchema } from '@/lib/ingest/schema';

const source = readFileSync(join(process.cwd(), 'connector', 'KavrixConnector.mq5'), 'utf8');
/** The code without its comments, so a comment saying "never OrderSend" does not count. */
const code = source.replace(/\/\/.*$/gm, '');

describe('KavrixConnector.mq5', () => {
  it('is read-only: no trade function, no trade library', () => {
    for (const forbidden of [
      'OrderSend',
      'OrderSendAsync',
      'OrderCheck',
      'PositionClose',
      'PositionModify',
      'OrderModify',
      'OrderDelete',
      'CTrade',
      'Trade.mqh',
      'TRADE_ACTION_',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('is pure ASCII', () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it('posts to /api/ingest with the token as a bearer', () => {
    expect(code).toContain('"/api/ingest"');
    expect(code).toContain('Authorization: Bearer ');
    expect(code).toContain('WebRequest("POST"');
  });

  it('sends every §12 field the schema requires, by the schema’s own names', () => {
    const shapes = [accountSchema, dealSchema, modificationSchema, calendarSchema, symbolInfoSchema];
    for (const shape of shapes) {
      for (const key of Object.keys(shape.shape)) expect(source, key).toContain(`\\"${key}\\":`);
    }
    for (const key of ['account', 'deals', 'modifications', 'calendar', 'symbolInfo']) {
      expect(source, key).toContain(`\\"${key}\\":`);
    }
  });

  it('keeps its queue under MQL5\\Files\\Kavrix and caps a batch at 100 deals', () => {
    expect(code).toContain('#define KAVRIX_FOLDER          "Kavrix"');
    expect(code).toMatch(/if\(batchSize > 100\)\s+batchSize = 100;/);
  });
});
