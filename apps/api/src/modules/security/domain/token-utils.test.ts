import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  generateServiceToken,
  parseTokenFormat,
  verifyTokenHash,
  computeTokenHash,
  clearPepperCache,
} from './token-utils.js';

describe('Token Utilities', () => {
  const testPepper = randomBytes(32);

  beforeEach(() => {
    clearPepperCache();
  });

  afterEach(() => {
    clearPepperCache();
  });

  describe('generateServiceToken', () => {
    it('generates a token in correct format', () => {
      const result = generateServiceToken(testPepper);
      expect(result.plaintext).toMatch(/^aidl_[0-9a-f]{8}_[0-9a-f]{64}$/);
      expect(result.prefix).toMatch(/^[0-9a-f]{8}$/);
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique tokens each time', () => {
      const t1 = generateServiceToken(testPepper);
      const t2 = generateServiceToken(testPepper);
      expect(t1.plaintext).not.toBe(t2.plaintext);
      expect(t1.prefix).not.toBe(t2.prefix);
      expect(t1.hash).not.toBe(t2.hash);
    });

    it('produces verifiable hash', () => {
      const result = generateServiceToken(testPepper);
      const parsed = parseTokenFormat(result.plaintext)!;
      expect(verifyTokenHash(parsed.secret, result.hash, testPepper)).toBe(true);
    });
  });

  describe('parseTokenFormat', () => {
    it('parses valid token format', () => {
      const token = 'aidl_abcd1234_' + 'a'.repeat(64);
      const result = parseTokenFormat(token);
      expect(result).toEqual({ prefix: 'abcd1234', secret: 'a'.repeat(64) });
    });

    it('returns null for missing aidl_ prefix', () => {
      expect(parseTokenFormat('xyz_abcd1234_' + 'a'.repeat(64))).toBeNull();
    });

    it('returns null for wrong number of parts', () => {
      expect(parseTokenFormat('aidl_extra_parts_here')).toBeNull();
      expect(parseTokenFormat('aidl_only')).toBeNull();
    });

    it('returns null for invalid prefix length (not 8 hex chars)', () => {
      expect(parseTokenFormat('aidl_abc_' + 'a'.repeat(64))).toBeNull();
      expect(parseTokenFormat('aidl_abcdefghi_' + 'a'.repeat(64))).toBeNull();
    });

    it('returns null for invalid secret length (not 64 hex chars)', () => {
      expect(parseTokenFormat('aidl_abcd1234_' + 'a'.repeat(32))).toBeNull();
      expect(parseTokenFormat('aidl_abcd1234_' + 'a'.repeat(128))).toBeNull();
    });

    it('returns null for non-hex characters in prefix', () => {
      expect(parseTokenFormat('aidl_abcdXYZW_' + 'a'.repeat(64))).toBeNull();
    });

    it('returns null for non-hex characters in secret', () => {
      expect(parseTokenFormat('aidl_abcd1234_' + 'g'.repeat(64))).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseTokenFormat('')).toBeNull();
    });

    it('returns null for undefined-like input', () => {
      expect(parseTokenFormat('undefined')).toBeNull();
      expect(parseTokenFormat('null')).toBeNull();
    });
  });

  describe('verifyTokenHash', () => {
    it('verifies correct token against hash', () => {
      const { plaintext, hash } = generateServiceToken(testPepper);
      const { secret } = parseTokenFormat(plaintext)!;
      expect(verifyTokenHash(secret, hash, testPepper)).toBe(true);
    });

    it('rejects wrong secret', () => {
      const { hash } = generateServiceToken(testPepper);
      const wrongSecret = 'b'.repeat(64);
      expect(verifyTokenHash(wrongSecret, hash, testPepper)).toBe(false);
    });

    it('rejects wrong pepper', () => {
      const { plaintext, hash } = generateServiceToken(testPepper);
      const { secret } = parseTokenFormat(plaintext)!;
      const wrongPepper = randomBytes(32);
      expect(verifyTokenHash(secret, hash, wrongPepper)).toBe(false);
    });

    it('rejects tampered hash', () => {
      const { plaintext } = generateServiceToken(testPepper);
      const { secret } = parseTokenFormat(plaintext)!;
      const tamperedHash = 'c'.repeat(64);
      expect(verifyTokenHash(secret, tamperedHash, testPepper)).toBe(false);
    });
  });

  describe('computeTokenHash', () => {
    it('produces consistent results for same input', () => {
      const secret = 'a'.repeat(64);
      const h1 = computeTokenHash(secret, testPepper);
      const h2 = computeTokenHash(secret, testPepper);
      expect(h1).toBe(h2);
    });

    it('produces different results for different secrets', () => {
      const h1 = computeTokenHash('a'.repeat(64), testPepper);
      const h2 = computeTokenHash('b'.repeat(64), testPepper);
      expect(h1).not.toBe(h2);
    });

    it('produces different results for different peppers', () => {
      const secret = 'a'.repeat(64);
      const h1 = computeTokenHash(secret, testPepper);
      const h2 = computeTokenHash(secret, randomBytes(32));
      expect(h1).not.toBe(h2);
    });
  });
});
