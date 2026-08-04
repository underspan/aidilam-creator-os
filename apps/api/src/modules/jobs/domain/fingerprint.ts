/**
 * Canonical Request Fingerprint
 *
 * Produces a deterministic SHA-256 fingerprint from material request fields.
 * Used for idempotency conflict detection.
 *
 * Rules:
 * - Object keys sorted recursively
 * - Array order preserved
 * - null and undefined treated consistently (null preserved, undefined omitted)
 * - Numbers and strings are distinct
 * - UTF-8 encoding
 * - No whitespace dependency
 * - No secrets included in fingerprint source
 */

import { createHash } from 'node:crypto';

/**
 * Canonicalize a value for deterministic JSON serialization.
 * - Objects: keys sorted alphabetically, recursively
 * - Arrays: order preserved, elements canonicalized
 * - Primitives: returned as-is
 * - undefined: omitted (not included in output)
 * - Circular references: will throw
 */
export function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value.map(item => canonicalize(item));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const v = canonicalize(obj[key]);
      if (v !== undefined) {
        sorted[key] = v;
      }
    }
    return sorted;
  }

  // Primitives: string, number, boolean
  return value;
}

/**
 * Produce deterministic JSON string from a value.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Material fields for job creation fingerprint.
 */
export interface JobFingerprintInput {
  actorId: string;
  projectId: string;
  jobType: string;
  priority: number;
  timeoutSeconds: number;
  inputPayload: unknown;
}

/**
 * Compute SHA-256 fingerprint for a job creation request.
 * Includes all material fields that define "same request".
 * Excludes: requestId, traceId, timestamps, tokens, IP, user-agent.
 */
export function computeJobFingerprint(input: JobFingerprintInput): string {
  const material = {
    actorId: input.actorId,
    projectId: input.projectId,
    jobType: input.jobType,
    priority: input.priority,
    timeoutSeconds: input.timeoutSeconds,
    inputPayload: input.inputPayload ?? null,
  };

  const canonical = canonicalJson(material);
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}
