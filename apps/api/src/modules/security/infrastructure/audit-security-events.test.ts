import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to declare mocks before vi.mock hoisting
const mockQuery = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));

vi.mock('../../../infrastructure/database/index.js', () => ({
  pgPool: { query: mockQuery },
}));

vi.mock('../../../core/logging/index.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { recordSecurityEvent } from './security-events.js';
import { recordAuditEvent } from './audit-events.js';

describe('Security Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordSecurityEvent', () => {
    it('records a security event', async () => {
      await recordSecurityEvent({
        requestId: 'req-1',
        eventType: 'authentication_failure',
        severity: 'warning',
        actorType: 'anonymous',
        sourceIp: '10.0.0.1',
        resource: '/api/v1/test',
        details: { reason: 'missing_header' },
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const args = mockQuery.mock.calls[0];
      expect(args[0]).toContain('INSERT INTO aidilam_app.security_events');
      expect(args[1]).toContain('req-1');
      expect(args[1]).toContain('authentication_failure');
    });

    it('redacts sensitive values in details', async () => {
      await recordSecurityEvent({
        requestId: 'req-2',
        eventType: 'authentication_failure',
        severity: 'warning',
        details: {
          reason: 'hash_mismatch',
          token: 'aidl_abcd1234_secret123',
          password: 'mysecretpass',
          apiKey: 'sk-12345',
          someData: 'aidl_prefix_exposed',
        },
      });

      const args = mockQuery.mock.calls[0];
      const detailsJson = args[1][8]; // 9th param is details JSON
      const details = JSON.parse(detailsJson);
      expect(details.reason).toBe('hash_mismatch');
      // 'token' key matches REDACT_KEYS -> redacted by key name
      expect(details.token).toBe('[REDACTED]');
      expect(details.password).toBe('[REDACTED]');
      expect(details.apiKey).toBe('[REDACTED]');
      // value starting with 'aidl_' is also caught
      expect(details.someData).toBe('[REDACTED_TOKEN]');
    });

    it('does not throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection lost'));
      await expect(recordSecurityEvent({
        requestId: 'req-3',
        eventType: 'authentication_failure',
        severity: 'warning',
      })).resolves.not.toThrow();
    });

    it('truncates long user-agent', async () => {
      const longAgent = 'x'.repeat(1000);
      await recordSecurityEvent({
        requestId: 'req-4',
        eventType: 'authentication_success',
        severity: 'info',
        userAgent: longAgent,
      });

      const args = mockQuery.mock.calls[0];
      expect(args[1][6].length).toBe(500); // userAgent param
    });
  });
});

describe('Audit Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordAuditEvent', () => {
    it('records an audit event', async () => {
      await recordAuditEvent({
        requestId: 'req-5',
        identity: {
          actorType: 'service_account',
          actorId: 'acc-1',
          displayName: 'Test Account',
          globalRoles: ['system_admin'],
          globalPermissions: ['*'],
          projectRoles: {},
        },
        action: 'project.create',
        resourceType: 'project',
        resourceId: 'proj-1',
        outcome: 'success',
        sourceIp: '10.0.0.1',
        newValues: { code: 'test-project', name: 'Test' },
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const args = mockQuery.mock.calls[0];
      expect(args[0]).toContain('INSERT INTO aidilam_app.audit_events');
      expect(args[1]).toContain('project.create');
      expect(args[1]).toContain('success');
    });

    it('redacts sensitive values in metadata', async () => {
      await recordAuditEvent({
        requestId: 'req-6',
        identity: {
          actorType: 'service_account',
          actorId: 'acc-1',
          displayName: 'Test',
          globalRoles: [],
          globalPermissions: [],
          projectRoles: {},
        },
        action: 'token.create',
        outcome: 'success',
        metadata: {
          description: 'My token',
          secretKey: 'should-be-redacted',
          nested: { password: 'hidden', visible: 'ok' },
        },
      });

      const args = mockQuery.mock.calls[0];
      const metadataJson = args[1][11]; // metadata param
      const metadata = JSON.parse(metadataJson);
      expect(metadata.description).toBe('My token');
      expect(metadata.secretKey).toBe('[REDACTED]');
      expect(metadata.nested.password).toBe('[REDACTED]');
      expect(metadata.nested.visible).toBe('ok');
    });

    it('redacts token values in newValues', async () => {
      await recordAuditEvent({
        requestId: 'req-7',
        identity: {
          actorType: 'service_account',
          actorId: 'acc-1',
          displayName: 'Test',
          globalRoles: [],
          globalPermissions: [],
          projectRoles: {},
        },
        action: 'test',
        outcome: 'success',
        newValues: {
          token: 'aidl_abcd1234_deadbeef',
          name: 'Normal value',
          someField: 'aidl_prefix_value',
        },
      });

      const args = mockQuery.mock.calls[0];
      const newValuesJson = args[1][13]; // new_values param
      const newValues = JSON.parse(newValuesJson);
      // 'token' key matches REDACT_KEYS pattern -> redacted by key name
      expect(newValues.token).toBe('[REDACTED]');
      // 'someField' value starts with 'aidl_' -> redacted as token value
      expect(newValues.someField).toBe('[REDACTED_TOKEN]');
      expect(newValues.name).toBe('Normal value');
    });

    it('does not throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection lost'));
      await expect(recordAuditEvent({
        requestId: 'req-8',
        identity: {
          actorType: 'system',
          actorId: 'system',
          displayName: 'System',
          globalRoles: [],
          globalPermissions: [],
          projectRoles: {},
        },
        action: 'test',
        outcome: 'failure',
      })).resolves.not.toThrow();
    });
  });
});
