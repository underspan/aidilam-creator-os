/**
 * Execution Snapshot Canonicalization & Hashing
 * AIDILAM-COM-04E2
 *
 * Deterministic canonical form ensures equivalent semantic snapshots produce same checksum.
 */
import { createHash } from 'node:crypto';

/**
 * Canonicalize a JSON object for deterministic hashing.
 * Sorts keys recursively, removes undefined values.
 */
export function canonicalizeJson(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value === undefined) return undefined;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
}

/**
 * Hash a canonical string with SHA-256, returns 64-char lowercase hex.
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Canonicalize execution snapshot payload for checksum computation.
 * Includes all semantic fields that define execution intent.
 * Excludes: id, createdAt, createdBy (non-semantic metadata).
 */
export function canonicalizeExecutionSnapshot(payload: {
  workspaceId: string;
  projectId: string;
  workflowDefinitionId: string;
  workflowVersionId: string;
  workflowVersionNumber: number;
  workflowChecksum: string;
  templateId: string | null;
  templateVersionId: string | null;
  templateChecksum: string | null;
  inputAssetId: string | null;
  inputAssetVersionId: string | null;
  inputAssetChecksum: string | null;
  effectiveConfigChecksum: string;
  providerPolicyChecksum: string;
  runtimePolicyJson: Record<string, unknown>;
  schemaVersion: string;
}): string {
  return canonicalizeJson({
    schemaVersion: payload.schemaVersion,
    workspaceId: payload.workspaceId,
    projectId: payload.projectId,
    workflowDefinitionId: payload.workflowDefinitionId,
    workflowVersionId: payload.workflowVersionId,
    workflowVersionNumber: payload.workflowVersionNumber,
    workflowChecksum: payload.workflowChecksum,
    templateId: payload.templateId,
    templateVersionId: payload.templateVersionId,
    templateChecksum: payload.templateChecksum,
    inputAssetId: payload.inputAssetId,
    inputAssetVersionId: payload.inputAssetVersionId,
    inputAssetChecksum: payload.inputAssetChecksum,
    effectiveConfigChecksum: payload.effectiveConfigChecksum,
    providerPolicyChecksum: payload.providerPolicyChecksum,
    runtimePolicyJson: payload.runtimePolicyJson,
  });
}

/**
 * Compute snapshot checksum from canonical payload.
 */
export function hashExecutionSnapshot(payload: Parameters<typeof canonicalizeExecutionSnapshot>[0]): string {
  const canonical = canonicalizeExecutionSnapshot(payload);
  return sha256Hex(canonical);
}
