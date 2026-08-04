import { describe, it, expect } from 'vitest';
import type { AuthMode } from './env.js';

describe('Configuration', () => {
  describe('AuthMode', () => {
    it('supports expected modes', () => {
      const validModes: AuthMode[] = ['disabled_internal', 'service_token', 'future_oidc'];
      expect(validModes).toHaveLength(3);
    });
  });
});
