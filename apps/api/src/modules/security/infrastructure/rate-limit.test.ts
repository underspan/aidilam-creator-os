import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to declare mocks before vi.mock hoisting
const mockIncr = vi.hoisted(() => vi.fn());
const mockTtl = vi.hoisted(() => vi.fn());
const mockExpire = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());

vi.mock('../../../infrastructure/redis/index.js', () => ({
  redis: {
    multi: () => ({
      incr: mockIncr,
      ttl: mockTtl,
      exec: mockExec,
    }),
    expire: mockExpire,
  },
}));

vi.mock('../../../core/logging/index.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('./security-events.js', () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

import { checkRateLimit, RATE_LIMITS } from './rate-limit.js';

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncr.mockReturnThis();
    mockTtl.mockReturnThis();
  });

  describe('checkRateLimit', () => {
    it('allows requests under the limit', async () => {
      mockExec.mockResolvedValueOnce([
        [null, 5], // count = 5
        [null, 55], // ttl = 55
      ]);

      const result = await checkRateLimit(RATE_LIMITS.generalApi, 'test-account');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(295); // 300 - 5
    });

    it('denies requests over the limit', async () => {
      mockExec.mockResolvedValueOnce([
        [null, 301], // count = 301 (over 300 limit)
        [null, 30], // ttl = 30
      ]);

      const result = await checkRateLimit(RATE_LIMITS.generalApi, 'test-account', 'req-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('sets expiry on first request', async () => {
      mockExec.mockResolvedValueOnce([
        [null, 1], // count = 1 (first)
        [null, -1], // ttl = -1 (no expiry set)
      ]);
      mockExpire.mockResolvedValueOnce(1);

      const result = await checkRateLimit(RATE_LIMITS.generalApi, 'test-account');
      expect(result.allowed).toBe(true);
      expect(mockExpire).toHaveBeenCalled();
    });

    it('fails closed for security admin when Redis unavailable', async () => {
      mockExec.mockResolvedValueOnce(null);

      const result = await checkRateLimit(RATE_LIMITS.securityAdmin, 'test-account');
      expect(result.allowed).toBe(false);
    });

    it('fails open for general API when Redis unavailable', async () => {
      mockExec.mockResolvedValueOnce(null);

      const result = await checkRateLimit(RATE_LIMITS.generalApi, 'test-account');
      expect(result.allowed).toBe(true);
    });

    it('fails closed for auth failure tracking when Redis errors', async () => {
      mockExec.mockRejectedValueOnce(new Error('Redis connection refused'));

      const result = await checkRateLimit(RATE_LIMITS.authFailure, '10.0.0.1');
      expect(result.allowed).toBe(false);
    });

    it('handles auth failure limit (10/min)', async () => {
      mockExec.mockResolvedValueOnce([
        [null, 11], // count = 11 (over 10 limit)
        [null, 45], // ttl = 45
      ]);

      const result = await checkRateLimit(RATE_LIMITS.authFailure, '10.0.0.1', 'req-2');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('RATE_LIMITS configuration', () => {
    it('has correct auth failure limits', () => {
      expect(RATE_LIMITS.authFailure.maxRequests).toBe(10);
      expect(RATE_LIMITS.authFailure.windowSeconds).toBe(60);
      expect(RATE_LIMITS.authFailure.failClosed).toBe(true);
    });

    it('has correct general API limits', () => {
      expect(RATE_LIMITS.generalApi.maxRequests).toBe(300);
      expect(RATE_LIMITS.generalApi.windowSeconds).toBe(60);
      expect(RATE_LIMITS.generalApi.failClosed).toBe(false);
    });

    it('has correct security admin limits', () => {
      expect(RATE_LIMITS.securityAdmin.maxRequests).toBe(60);
      expect(RATE_LIMITS.securityAdmin.windowSeconds).toBe(60);
      expect(RATE_LIMITS.securityAdmin.failClosed).toBe(true);
    });
  });
});
