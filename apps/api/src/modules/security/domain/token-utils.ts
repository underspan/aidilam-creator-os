/**
 * Service Token Utilities
 *
 * Token format: aidl_<prefix>_<secret>
 *   - prefix: 8 hex characters (4 bytes) - identifies the token record
 *   - secret: 64 hex characters (32 bytes / 256 bits) - the secret part
 *
 * Storage:
 *   - token_prefix stored in DB for lookup
 *   - token_hash = HMAC-SHA256(secret, pepper) stored in DB
 *   - plaintext never stored
 *
 * Threat model:
 *   - If DB is compromised: attacker has prefix + HMAC hash but NOT the secret.
 *     Without the pepper, they cannot reconstruct valid tokens.
 *   - If pepper alone is compromised: useless without DB hashes.
 *   - Both pepper + DB compromised: attacker could attempt brute force against
 *     256-bit random secrets, which is computationally infeasible.
 *   - Token prefix allows O(1) lookup without exposing the secret to timing attacks.
 *   - Constant-time comparison used for HMAC output verification.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TOKEN_PREFIX_BYTES = 4; // 8 hex chars
const TOKEN_SECRET_BYTES = 32; // 64 hex chars, 256 bits

let cachedPepper: Buffer | null = null;

export function loadPepper(path: string): Buffer {
  if (cachedPepper) return cachedPepper;
  const raw = readFileSync(path, 'utf-8').trim();
  cachedPepper = Buffer.from(raw, 'hex');
  if (cachedPepper.length < 32) {
    throw new Error('Service token pepper must be at least 32 bytes');
  }
  return cachedPepper;
}

export function clearPepperCache(): void {
  cachedPepper = null;
}

export interface GeneratedToken {
  /** Full token string: aidl_<prefix>_<secret> */
  plaintext: string;
  /** Prefix for DB lookup (8 hex chars) */
  prefix: string;
  /** HMAC-SHA256 hash of the secret portion */
  hash: string;
}

/**
 * Generate a new service token.
 * The plaintext is returned ONCE and must never be stored server-side.
 */
export function generateServiceToken(pepper: Buffer): GeneratedToken {
  const prefixBytes = randomBytes(TOKEN_PREFIX_BYTES);
  const secretBytes = randomBytes(TOKEN_SECRET_BYTES);

  const prefix = prefixBytes.toString('hex');
  const secret = secretBytes.toString('hex');
  const plaintext = `aidl_${prefix}_${secret}`;

  const hash = computeTokenHash(secret, pepper);

  return { plaintext, prefix, hash };
}

/**
 * Compute HMAC-SHA256 hash of a token secret using the pepper.
 */
export function computeTokenHash(secret: string, pepper: Buffer): string {
  return createHmac('sha256', pepper).update(secret).digest('hex');
}

/**
 * Parse a token string into its components.
 * Returns null if format is invalid.
 */
export function parseTokenFormat(token: string): { prefix: string; secret: string } | null {
  if (!token.startsWith('aidl_')) return null;

  const parts = token.split('_');
  if (parts.length !== 3) return null;

  const [, prefix, secret] = parts;

  // Validate prefix: exactly 8 hex chars
  if (!/^[0-9a-f]{8}$/.test(prefix)) return null;

  // Validate secret: exactly 64 hex chars
  if (!/^[0-9a-f]{64}$/.test(secret)) return null;

  return { prefix, secret };
}

/**
 * Verify a token secret against a stored hash using constant-time comparison.
 */
export function verifyTokenHash(secret: string, storedHash: string, pepper: Buffer): boolean {
  const computed = computeTokenHash(secret, pepper);
  const computedBuf = Buffer.from(computed, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');

  if (computedBuf.length !== storedBuf.length) return false;

  return timingSafeEqual(computedBuf, storedBuf);
}
