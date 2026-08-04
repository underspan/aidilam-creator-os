import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyRequest } from 'fastify';
import { RequestIdentity } from './identity.js';

// Mock pgPool and recordSecurityEvent before importing authorization
vi.mock('../../../infrastructure/database/index.js', () => ({
  pgPool: { query: vi.fn() },
}));
vi.mock('../infrastructure/security-events.js', () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  requireAuthenticated,
  requirePermission,
  requireProjectPermission,
  requireAnyPermission,
  requireGlobalRole,
} from './authorization.js';
import { pgPool } from '../../../infrastructure/database/index.js';

function makeRequest(identity: RequestIdentity): FastifyRequest {
  return {
    identity,
    id: 'test-request-id',
    ip: '127.0.0.1',
    url: '/api/v1/test',
    headers: { 'user-agent': 'test' },
  } as unknown as FastifyRequest;
}

const systemAdmin: RequestIdentity = {
  actorType: 'service_account',
  actorId: 'admin-uuid',
  serviceAccountCode: 'aidilam-internal-admin',
  displayName: 'Admin',
  globalRoles: ['system_admin'],
  globalPermissions: ['system.read', 'projects.create', 'projects.read', 'projects.update', 'jobs.create', 'jobs.read'],
  projectRoles: {},
};

const projectViewer: RequestIdentity = {
  actorType: 'service_account',
  actorId: 'viewer-uuid',
  serviceAccountCode: 'dep006-project-viewer',
  displayName: 'Viewer',
  globalRoles: ['service_worker'],
  globalPermissions: ['system.read', 'projects.read', 'jobs.read'],
  projectRoles: {},
};

const noAccessIdentity: RequestIdentity = {
  actorType: 'service_account',
  actorId: 'no-access-uuid',
  serviceAccountCode: 'dep006-no-access',
  displayName: 'No Access',
  globalRoles: [],
  globalPermissions: [],
  projectRoles: {},
};

const anonymousIdentity: RequestIdentity = {
  actorType: 'anonymous',
  actorId: 'anonymous',
  displayName: 'Anonymous',
  globalRoles: [],
  globalPermissions: [],
  projectRoles: {},
};

const wildcardIdentity: RequestIdentity = {
  actorType: 'system',
  actorId: 'system-internal',
  displayName: 'System',
  globalRoles: ['system_admin'],
  globalPermissions: ['*'],
  projectRoles: {},
};

describe('Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuthenticated', () => {
    it('returns identity for authenticated request', () => {
      const req = makeRequest(systemAdmin);
      const result = requireAuthenticated(req);
      expect(result).toBe(systemAdmin);
    });

    it('throws AUTHENTICATION_REQUIRED for anonymous', () => {
      const req = makeRequest(anonymousIdentity);
      expect(() => requireAuthenticated(req)).toThrow('Authentication is required');
    });
  });

  describe('requirePermission', () => {
    it('allows when identity has the permission', async () => {
      const req = makeRequest(systemAdmin);
      await expect(requirePermission(req, 'projects.create')).resolves.not.toThrow();
    });

    it('allows wildcard (*) permission', async () => {
      const req = makeRequest(wildcardIdentity);
      await expect(requirePermission(req, 'any.permission')).resolves.not.toThrow();
    });

    it('denies when identity lacks the permission', async () => {
      const req = makeRequest(noAccessIdentity);
      await expect(requirePermission(req, 'projects.create')).rejects.toThrow('Insufficient permissions');
    });

    it('denies anonymous requests', async () => {
      const req = makeRequest(anonymousIdentity);
      await expect(requirePermission(req, 'projects.read')).rejects.toThrow('Authentication is required');
    });
  });

  describe('requireProjectPermission', () => {
    it('allows when identity has global permission', async () => {
      const req = makeRequest(systemAdmin);
      await expect(requireProjectPermission(req, 'project-1', 'projects.read')).resolves.not.toThrow();
    });

    it('allows wildcard (*) permission', async () => {
      const req = makeRequest(wildcardIdentity);
      await expect(requireProjectPermission(req, 'project-1', 'projects.update')).resolves.not.toThrow();
    });

    it('allows when project role assignment grants permission', async () => {
      const req = makeRequest(noAccessIdentity);
      // Mock: project role assignment found
      (pgPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ '1': 1 }] });
      await expect(requireProjectPermission(req, 'project-1', 'projects.read')).resolves.not.toThrow();
    });

    it('denies when no global or project permission', async () => {
      const req = makeRequest(noAccessIdentity);
      // Mock: no project role assignment found
      (pgPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
      await expect(requireProjectPermission(req, 'project-1', 'projects.update')).rejects.toThrow('Insufficient permissions');
    });
  });

  describe('requireAnyPermission', () => {
    it('allows when identity has at least one permission', async () => {
      const req = makeRequest(projectViewer);
      await expect(requireAnyPermission(req, ['projects.create', 'projects.read'])).resolves.not.toThrow();
    });

    it('denies when identity has none of the permissions', async () => {
      const req = makeRequest(noAccessIdentity);
      await expect(requireAnyPermission(req, ['projects.create', 'projects.update'])).rejects.toThrow('Insufficient permissions');
    });
  });

  describe('requireGlobalRole', () => {
    it('allows when identity has the role', async () => {
      const req = makeRequest(systemAdmin);
      await expect(requireGlobalRole(req, 'system_admin')).resolves.not.toThrow();
    });

    it('denies when identity lacks the role', async () => {
      const req = makeRequest(noAccessIdentity);
      await expect(requireGlobalRole(req, 'system_admin')).rejects.toThrow('Insufficient role');
    });

    it('allows wildcard identity', async () => {
      const req = makeRequest(wildcardIdentity);
      await expect(requireGlobalRole(req, 'system_admin')).resolves.not.toThrow();
    });
  });

  describe('deny-by-default', () => {
    it('denies requests with no permissions at all', async () => {
      const req = makeRequest(noAccessIdentity);
      await expect(requirePermission(req, 'system.read')).rejects.toThrow('Insufficient permissions');
    });

    it('denies anonymous for any permission', async () => {
      const req = makeRequest(anonymousIdentity);
      await expect(requirePermission(req, 'system.read')).rejects.toThrow('Authentication is required');
    });
  });
});
