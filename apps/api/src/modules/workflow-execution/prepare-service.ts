/**
 * Prepare Execution Service
 * AIDILAM-COM-04E2
 *
 * Creates immutable snapshot + execution + node execution rows.
 * Does NOT execute any node business logic.
 */
import { randomUUID } from 'node:crypto';
import { canonicalizeJson, sha256Hex, hashExecutionSnapshot } from './snapshot-hash.js';
import { ExecutionSnapshotInput, ExecutionSnapshot, WorkflowExecution, NodeExecution } from './types.js';

export interface PrepareExecutionDeps {
  // DB queries abstracted for testability
  getWorkflowVersion(versionId: string): Promise<{ id: string; workflow_definition_id: string; version_number: number; checksum_sha256: string; configuration_json: any } | null>;
  getWorkflowNodes(versionId: string): Promise<Array<{ node_key: string; node_type: string; position_index: number }>>;
  getWorkflowEdges(versionId: string): Promise<Array<{ from_node_key: string; to_node_key: string; edge_type: string }>>;
  getTemplateVersion(versionId: string): Promise<{ id: string; template_id: string; config_checksum: string; config_json: any } | null>;
  getAssetVersion(versionId: string): Promise<{ id: string; asset_id: string; checksum_sha256: string } | null>;
  getProviderPolicy(workspaceId: string, capabilities: string[]): Promise<Record<string, unknown>>;
  checkWorkspaceMembership(userId: string, workspaceId: string): Promise<boolean>;
  checkProjectAccess(userId: string, projectId: string): Promise<boolean>;
  checkWorkflowVisibility(workflowDefId: string, workspaceId: string): Promise<boolean>;
  checkAssetBelongsToWorkspace(assetVersionId: string, workspaceId: string): Promise<boolean>;
  findExistingSnapshot(workspaceId: string, idempotencyKey: string): Promise<{ id: string; snapshotChecksumSha256: string } | null>;
  findExecutionForSnapshot(snapshotId: string): Promise<{ id: string } | null>;
  persistSnapshot(snapshot: any): Promise<void>;
  persistExecution(execution: any): Promise<void>;
  persistNodeExecutions(nodes: any[]): Promise<void>;
  persistAudit(event: any): Promise<void>;
}

export interface PrepareResult {
  success: boolean;
  error?: { code: string; message: string };
  snapshotId?: string;
  executionId?: string;
  snapshotChecksum?: string;
  nodeCount?: number;
}

const DEFAULT_RUNTIME_POLICY = {
  maxRetries: 3,
  timeoutSeconds: 3600,
  cancelPolicy: 'immediate',
};

export async function prepareWorkflowExecution(
  input: ExecutionSnapshotInput,
  deps: PrepareExecutionDeps
): Promise<PrepareResult> {

  // === AUTHORIZATION ===
  const hasMembership = await deps.checkWorkspaceMembership(input.actorId, input.workspaceId);
  if (!hasMembership) return { success: false, error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

  const hasProjectAccess = await deps.checkProjectAccess(input.actorId, input.projectId);
  if (!hasProjectAccess) return { success: false, error: { code: 'PROJECT_ACCESS_DENIED', message: 'No project access' } };

  // === WORKFLOW VALIDATION ===
  const wfVersion = await deps.getWorkflowVersion(input.workflowVersionId);
  if (!wfVersion) return { success: false, error: { code: 'WORKFLOW_VERSION_NOT_FOUND', message: 'Workflow version not found' } };

  const wfVisible = await deps.checkWorkflowVisibility(wfVersion.workflow_definition_id, input.workspaceId);
  if (!wfVisible) return { success: false, error: { code: 'WORKFLOW_NOT_VISIBLE', message: 'Workflow not visible in workspace' } };

  // === TEMPLATE VALIDATION (optional) ===
  let templateChecksum: string | null = null;
  if (input.templateVersionId) {
    const tv = await deps.getTemplateVersion(input.templateVersionId);
    if (!tv) return { success: false, error: { code: 'TEMPLATE_VERSION_NOT_FOUND', message: 'Template version not found' } };
    templateChecksum = tv.config_checksum;
  }

  // === ASSET VALIDATION (optional) ===
  let inputAssetChecksum: string | null = null;
  if (input.inputAssetVersionId) {
    const av = await deps.getAssetVersion(input.inputAssetVersionId);
    if (!av) return { success: false, error: { code: 'ASSET_VERSION_NOT_FOUND', message: 'Asset version not found' } };
    const belongsToWs = await deps.checkAssetBelongsToWorkspace(input.inputAssetVersionId, input.workspaceId);
    if (!belongsToWs) return { success: false, error: { code: 'ASSET_ACCESS_DENIED', message: 'Asset does not belong to workspace' } };
    inputAssetChecksum = av.checksum_sha256;
  }

  // === PROVIDER POLICY SNAPSHOT ===
  const nodes = await deps.getWorkflowNodes(input.workflowVersionId);
  const edges = await deps.getWorkflowEdges(input.workflowVersionId);
  const capabilities = [...new Set(nodes.map(n => (n as any).capability).filter(Boolean))];
  const providerPolicy = await deps.getProviderPolicy(input.workspaceId, capabilities);

  // === CANONICALIZATION ===
  const effectiveConfigChecksum = sha256Hex(canonicalizeJson(input.effectiveConfig));
  const providerPolicyChecksum = sha256Hex(canonicalizeJson(providerPolicy));

  const snapshotPayload = {
    schemaVersion: '1.0',
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    workflowDefinitionId: wfVersion.workflow_definition_id,
    workflowVersionId: input.workflowVersionId,
    workflowVersionNumber: wfVersion.version_number,
    workflowChecksum: wfVersion.checksum_sha256,
    templateId: input.templateId || null,
    templateVersionId: input.templateVersionId || null,
    templateChecksum,
    inputAssetId: input.inputAssetId || null,
    inputAssetVersionId: input.inputAssetVersionId || null,
    inputAssetChecksum,
    effectiveConfigChecksum,
    providerPolicyChecksum,
    runtimePolicyJson: DEFAULT_RUNTIME_POLICY,
  };

  const snapshotChecksum = hashExecutionSnapshot(snapshotPayload);

  // === IDEMPOTENCY CHECK ===
  if (input.idempotencyKey) {
    const existing = await deps.findExistingSnapshot(input.workspaceId, input.idempotencyKey);
    if (existing) {
      // Same key: check if intent matches
      if (existing.snapshotChecksumSha256 !== snapshotChecksum) {
        return { success: false, error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Same key but different execution intent' } };
      }
      // Idempotent replay: return existing
      const existingExec = await deps.findExecutionForSnapshot(existing.id);
      return {
        success: true,
        snapshotId: existing.id,
        executionId: existingExec?.id,
        snapshotChecksum: existing.snapshotChecksumSha256,
        nodeCount: nodes.length,
      };
    }
  }

  // === PERSIST SNAPSHOT ===
  const snapshotId = randomUUID();
  const snapshotJson = {
    ...snapshotPayload,
    effectiveConfig: input.effectiveConfig,
    providerPolicy,
    nodes: nodes.map(n => ({ nodeKey: n.node_key, nodeType: n.node_type, ordinal: n.position_index })),
    edges: edges.map(e => ({ from: e.from_node_key, to: e.to_node_key, type: e.edge_type })),
  };

  await deps.persistSnapshot({
    id: snapshotId,
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    workflow_definition_id: wfVersion.workflow_definition_id,
    workflow_version_id: input.workflowVersionId,
    workflow_version_number: wfVersion.version_number,
    workflow_checksum: wfVersion.checksum_sha256,
    template_id: input.templateId || null,
    template_version_id: input.templateVersionId || null,
    template_checksum: templateChecksum,
    input_asset_id: input.inputAssetId || null,
    input_asset_version_id: input.inputAssetVersionId || null,
    input_asset_checksum: inputAssetChecksum,
    effective_config_json: input.effectiveConfig,
    effective_config_checksum: effectiveConfigChecksum,
    provider_policy_json: providerPolicy,
    provider_policy_checksum: providerPolicyChecksum,
    runtime_policy_json: DEFAULT_RUNTIME_POLICY,
    snapshot_json: snapshotJson,
    snapshot_checksum_sha256: snapshotChecksum,
    schema_version: '1.0',
    created_by: input.actorId,
    idempotency_key: input.idempotencyKey || null,
  });

  // === PERSIST EXECUTION ===
  const executionId = randomUUID();
  await deps.persistExecution({
    id: executionId,
    snapshot_id: snapshotId,
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    execution_mode: 'dry_run',
    status: 'prepared',
    current_node_key: null,
    progress_percent: 0,
    attempt: 1,
    state_version: 1,
  });

  // === PERSIST NODE EXECUTIONS ===
  const nodeExecs = nodes.map((n, i) => ({
    id: randomUUID(),
    execution_id: executionId,
    node_key: n.node_key,
    node_type: n.node_type,
    ordinal: n.position_index,
    status: 'pending',
    attempt: 1,
    state_version: 1,
    progress_percent: 0,
  }));
  await deps.persistNodeExecutions(nodeExecs);

  // === AUDIT ===
  await deps.persistAudit({
    execution_id: executionId,
    event_type: 'workflow_execution_prepared',
    actor_id: input.actorId,
    detail_json: { snapshotId, snapshotChecksum, nodeCount: nodes.length, executionMode: 'dry_run' },
  });

  return {
    success: true,
    snapshotId,
    executionId,
    snapshotChecksum,
    nodeCount: nodes.length,
  };
}
