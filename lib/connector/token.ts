/**
 * Connector tokens (CLAUDE.md §2, §12).
 *
 * A token is `kvx_` and 43 base64url characters — 256 random bits. The trader
 * sees it once, when Settings generates it, and pastes it into the Kavrix
 * Connector's inputs. Kavrix keeps only:
 *
 * - its **hash**: HMAC-SHA-256 under a server-side pepper
 *   (`CONNECTOR_TOKEN_PEPPER`), hex. A leaked table is useless without the
 *   pepper, and a token can never be read back out of it;
 * - its **prefix**: the first 12 characters, so two tokens can be told apart
 *   in a list. Twelve characters of which four are `kvx_` leave 208 random
 *   bits unshown.
 *
 * Node-only (`node:crypto`): used by server actions and the ingest route.
 */

import { createHmac, randomBytes } from 'node:crypto';

export const TOKEN_SCHEME = 'kvx_';
export const TOKEN_PREFIX_LENGTH = 12;
/** A pepper shorter than this is refused: it would be guessable. */
export const MIN_PEPPER_LENGTH = 32;

const TOKEN_PATTERN = /^kvx_[A-Za-z0-9_-]{43}$/;

export interface GeneratedToken {
  /** The whole token. Shown once, never stored. */
  token: string;
  /** What Settings lists it by. */
  prefix: string;
  /** What the database stores. */
  hash: string;
}

/** Whether a string has the shape of a Kavrix token. Says nothing about whether it is valid. */
export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX_LENGTH);
}

/** HMAC-SHA-256 of the token under the pepper, lowercase hex (64 characters). */
export function hashConnectorToken(token: string, pepper: string): string {
  if (pepper.length < MIN_PEPPER_LENGTH) {
    throw new RangeError(`the token pepper must be at least ${MIN_PEPPER_LENGTH} characters`);
  }
  return createHmac('sha256', pepper).update(token, 'utf8').digest('hex');
}

/** A fresh token, its prefix and its hash. `random` is injectable for tests. */
export function generateConnectorToken(
  pepper: string,
  random: (size: number) => Buffer = randomBytes,
): GeneratedToken {
  const token = `${TOKEN_SCHEME}${random(32).toString('base64url')}`;
  return { token, prefix: tokenPrefix(token), hash: hashConnectorToken(token, pepper) };
}

/** The pepper from the environment, or `null` when it is missing or too short. */
export function connectorPepper(): string | null {
  const value = process.env.CONNECTOR_TOKEN_PEPPER?.trim() ?? '';
  return value.length >= MIN_PEPPER_LENGTH ? value : null;
}

/** The token from an `Authorization: Bearer …` header, or `null`. */
export function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}
