import { describe, it, expect } from 'vitest';
import { ANONYMOUS_IDENTITY } from './identity.js';

describe('Identity', () => {
  describe('ANONYMOUS_IDENTITY', () => {
    it('has actor type anonymous', () => {
      expect(ANONYMOUS_IDENTITY.actorType).toBe('anonymous');
    });

    it('has no global roles', () => {
      expect(ANONYMOUS_IDENTITY.globalRoles).toEqual([]);
    });

    it('has no permissions', () => {
      expect(ANONYMOUS_IDENTITY.globalPermissions).toEqual([]);
    });

    it('has no project roles', () => {
      expect(ANONYMOUS_IDENTITY.projectRoles).toEqual({});
    });
  });
});
