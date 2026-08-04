/**
 * Security Events Infrastructure
 *
 * Records security events to the database for audit and alerting.
 * Events are written asynchronously where possible to not block request processing.
 */

import { pgPool } from '../../../infrastructure/database/index.js';
import { logger } from '../../../core/logging/index.js';

export interface SecurityEventInput {
  requestId?: string;
  eventType: string;
  severity: 'info' | 'warning' | 'high' | 'critical';
  actorType?: string;
  actorId?: string;
  sourceIp?: string;
  userAgent?: string;
  resource?: string;
  details?: Record<string, unknown>;
}

/**
 * Record a security event to the database.
 * Fails silently (logs error) to not break request flow.
 */
export async function recordSecurityEvent(event: SecurityEventInput): Promise<void> {
  try {
    // Sanitize details - remove any token/secret values
    const sanitizedDetails = event.details ? sanitizeEventDetails(event.details) : null;

    await pgPool.query(
      `INSERT INTO aidilam_app.security_events
       (request_id, event_type, severity, actor_type, actor_id, source_ip, user_agent, resource, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.requestId || null,
        event.eventType,
        event.severity,
        event.actorType || null,
        event.actorId || null,
        event.sourceIp || null,
        truncate(event.userAgent, 500),
        truncate(event.resource, 2000),
        sanitizedDetails ? JSON.stringify(sanitizedDetails) : null,
      ]
    );
  } catch (err) {
    // Never let security event recording failures break the request
    logger.error('Failed to record security event', {
      eventType: event.eventType,
      error: (err as Error).message,
    });
  }
}

const REDACT_KEYS = /token|secret|password|key|pepper|authorization|cookie|credential/i;

function sanitizeEventDetails(details: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (REDACT_KEYS.test(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.startsWith('aidl_')) {
      result[key] = '[REDACTED_TOKEN]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeEventDetails(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function truncate(value: string | undefined, maxLen: number): string | null {
  if (!value) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}
