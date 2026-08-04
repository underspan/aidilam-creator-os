/**
 * Audit Events Infrastructure
 *
 * Records immutable audit events for state-changing operations.
 * Audit records capture: who, what, when, where, result.
 */

import { pgPool } from '../../../infrastructure/database/index.js';
import { logger } from '../../../core/logging/index.js';
import { RequestIdentity } from '../domain/identity.js';
import type pg from 'pg';

export interface AuditEventInput {
  requestId?: string;
  identity: RequestIdentity;
  action: string;
  resourceType?: string;
  resourceId?: string;
  projectId?: string;
  outcome: 'success' | 'denied' | 'failure';
  sourceIp?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

const REDACT_KEYS = /token|secret|password|key|pepper|authorization|cookie|credential/i;

/**
 * Record an audit event. If a client (transaction) is provided, use it.
 * Otherwise use the pool directly.
 */
export async function recordAuditEvent(
  event: AuditEventInput,
  client?: pg.PoolClient,
): Promise<void> {
  try {
    const sanitizedMetadata = event.metadata ? redactSensitive(event.metadata) : null;
    const sanitizedPrevious = event.previousValues ? redactSensitive(event.previousValues) : null;
    const sanitizedNew = event.newValues ? redactSensitive(event.newValues) : null;

    const query = `INSERT INTO aidilam_app.audit_events
       (request_id, actor_type, actor_id, actor_display, action,
        resource_type, resource_id, project_id, outcome,
        source_ip, user_agent, metadata, previous_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`;

    const params = [
      event.requestId || null,
      event.identity.actorType,
      event.identity.actorId,
      event.identity.displayName,
      event.action,
      event.resourceType || null,
      event.resourceId || null,
      event.projectId || null,
      event.outcome,
      event.sourceIp || null,
      event.userAgent ? event.userAgent.slice(0, 500) : null,
      sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
      sanitizedPrevious ? JSON.stringify(sanitizedPrevious) : null,
      sanitizedNew ? JSON.stringify(sanitizedNew) : null,
    ];

    if (client) {
      await client.query(query, params);
    } else {
      await pgPool.query(query, params);
    }
  } catch (err) {
    logger.error('Failed to record audit event', {
      action: event.action,
      error: (err as Error).message,
    });
  }
}

/**
 * Recursively redact sensitive values from an object.
 */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACT_KEYS.test(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.startsWith('aidl_')) {
      result[key] = '[REDACTED_TOKEN]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
