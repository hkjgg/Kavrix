import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bearerToken,
  generateConnectorToken,
  hashConnectorToken,
  isWellFormedToken,
  tokenPrefix,
} from './token';

const PEPPER = 'p'.repeat(40);

describe('connector tokens', () => {
  it('generates kvx_ plus 43 base64url characters from 32 random bytes', () => {
    const { token, prefix, hash } = generateConnectorToken(PEPPER, (size) => Buffer.alloc(size, 0xff));
    expect(token).toBe(`kvx_${'_'.repeat(42)}8`); // 42 × 0b111111, then 0b1111 padded: '8'
    expect(isWellFormedToken(token)).toBe(true);
    expect(prefix).toBe(token.slice(0, 12));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes with HMAC-SHA-256 under the pepper, never the bare SHA-256', () => {
    const token = generateConnectorToken(PEPPER).token;
    const expected = createHmac('sha256', PEPPER).update(token).digest('hex');
    expect(hashConnectorToken(token, PEPPER)).toBe(expected);
    // A different pepper gives a different hash: the table alone is useless.
    expect(hashConnectorToken(token, 'q'.repeat(40))).not.toBe(expected);
  });

  it('is deterministic for the same token and pepper', () => {
    const token = 'kvx_' + 'a'.repeat(43);
    expect(hashConnectorToken(token, PEPPER)).toBe(hashConnectorToken(token, PEPPER));
  });

  it('never stores enough in the prefix to use the token', () => {
    const { token, prefix } = generateConnectorToken(PEPPER);
    expect(prefix).toHaveLength(12);
    expect(tokenPrefix(token)).toBe(prefix);
    expect(token.length - prefix.length).toBe(35);
  });

  it('refuses a short pepper', () => {
    expect(() => hashConnectorToken('kvx_x', 'short')).toThrow(RangeError);
  });

  it('gives two tokens two hashes', () => {
    const a = generateConnectorToken(PEPPER);
    const b = generateConnectorToken(PEPPER);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it('reads a bearer header', () => {
    expect(bearerToken('Bearer kvx_abc')).toBe('kvx_abc');
    expect(bearerToken('bearer   kvx_abc  ')).toBe('kvx_abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it('checks the shape', () => {
    expect(isWellFormedToken('kvx_' + 'A'.repeat(43))).toBe(true);
    expect(isWellFormedToken('kvx_' + 'A'.repeat(42))).toBe(false);
    expect(isWellFormedToken('abc_' + 'A'.repeat(43))).toBe(false);
    expect(isWellFormedToken('kvx_' + 'A'.repeat(42) + '=')).toBe(false);
  });
});
