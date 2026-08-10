/**
 * COM-04E2 Dedicated Tests Part 3: Prepare Service + Dry-Run Harness
 */
import { describe, it, expect } from 'vitest';
import { prepareWorkflowExecution, PrepareExecutionDeps } from './prepare-service.js';
import { runDryExecution, cancelExecution, retryNode, DryRunDeps } from './dry-run-harness.js';
import { WorkflowExecution, NodeExecution, NodeStatus, ExecutionStatus } from './types.js';

// === MOCK DEPS FACTORY ===
function mockPrepareDeps(overrides: Partial<PrepareExecutionDeps> = {}): PrepareExecutionDeps {
  return {
    getWorkflowVersion: async () => ({ id: 'wv1', workflow_definition_id: 'wd1', version_number: 1, checksum_sha256: 'a'.repeat(64), configuration_json: {} }),
    getWorkflowNodes: async () => [
      { node_key: 'source', node_type: 'source', position_index: 0 },
      { node_key: 'stt', node_type: 'stt', position_index: 1 },
      { node_key: 'translate', node_type: 'translate', position_index: 2 },
      { node_key: 'review', node_type: 'review', position_index: 3 },
    ],
    getWorkflowEdges: async () => [
      { from_node_key: 'source', to_node_key: 'stt', edge_type: 'success' },
      { from_node_key: 'stt', to_node_key: 'translate', edge_type: 'success' },
      { from_node_key: 'translate', to_node_key: 'review', edge_type: 'success' },
    ],
    getTemplateVersion: async () => ({ id: 'tv1', template_id: 't1', config_checksum: 'b'.repeat(64), config_json: {} }),
    getAssetVersion: async () => ({ id: 'av1', asset_id: 'a1', checksum_sha256: 'c'.repeat(64) }),
    getProviderPolicy: async () => ({ stt: { configId: 'cfg1', definitionId: 'def1' } }),
    checkWorkspaceMembership: async () => true,
    checkProjectAccess: async () => true,
    checkWorkflowVisibility: async () => true,
    checkAssetBelongsToWorkspace: async () => true,
    findExistingSnapshot: async () => null,
    findExecutionForSnapshot: async () => null,
    persistSnapshot: async () => {},
    persistExecution: async () => {},
    persistNodeExecutions: async () => {},
    persistAudit: async () => {},
    ...overrides,
  };
}

const BASE_INPUT = {
  workspaceId: 'ws1',
  projectId: 'proj1',
  workflowDefinitionId: 'wd1',
  workflowVersionId: 'wv1',
  templateId: 't1',
  templateVersionId: 'tv1',
  inputAssetId: 'a1',
  inputAssetVersionId: 'av1',
  effectiveConfig: { lang: 'vi' },
  actorId: 'user1',
  idempotencyKey: 'key-001',
};

describe('Prepare Execution Service', () => {
  it('56: successful preparation returns snapshot + execution IDs', async () => {
    const r = await prepareWorkflowExecution(BASE_INPUT, mockPrepareDeps());
    expect(r.success).toBe(true);
    expect(r.snapshotId).toBeDefined();
    expect(r.executionId).toBeDefined();
    expect(r.snapshotChecksum).toHaveLength(64);
    expect(r.nodeCount).toBe(4);
  });

  it('57: denies non-workspace-member', async () => {
    const deps = mockPrepareDeps({ checkWorkspaceMembership: async () => false });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('ACCESS_DENIED');
  });

  it('58: denies non-project-member', async () => {
    const deps = mockPrepareDeps({ checkProjectAccess: async () => false });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('PROJECT_ACCESS_DENIED');
  });

  it('59: rejects non-existent workflow version', async () => {
    const deps = mockPrepareDeps({ getWorkflowVersion: async () => null });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('WORKFLOW_VERSION_NOT_FOUND');
  });

  it('60: rejects non-visible workflow', async () => {
    const deps = mockPrepareDeps({ checkWorkflowVisibility: async () => false });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('WORKFLOW_NOT_VISIBLE');
  });

  it('61: rejects non-existent template version', async () => {
    const deps = mockPrepareDeps({ getTemplateVersion: async () => null });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('TEMPLATE_VERSION_NOT_FOUND');
  });

  it('62: rejects non-existent asset version', async () => {
    const deps = mockPrepareDeps({ getAssetVersion: async () => null });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('ASSET_VERSION_NOT_FOUND');
  });

  it('63: rejects asset from wrong workspace', async () => {
    const deps = mockPrepareDeps({ checkAssetBelongsToWorkspace: async () => false });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('ASSET_ACCESS_DENIED');
  });

  it('64: idempotent replay returns same snapshot', async () => {
    const deps = mockPrepareDeps({
      findExistingSnapshot: async () => ({ id: 'snap-existing', snapshotChecksumSha256: '' }),
      findExecutionForSnapshot: async () => ({ id: 'exec-existing' }),
    });
    // Need to match checksum - hack: override to return matching checksum
    const firstResult = await prepareWorkflowExecution(BASE_INPUT, mockPrepareDeps());
    const deps2 = mockPrepareDeps({
      findExistingSnapshot: async () => ({ id: 'snap-existing', snapshotChecksumSha256: firstResult.snapshotChecksum! }),
      findExecutionForSnapshot: async () => ({ id: 'exec-existing' }),
    });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps2);
    expect(r.success).toBe(true);
    expect(r.snapshotId).toBe('snap-existing');
    expect(r.executionId).toBe('exec-existing');
  });

  it('65: same key different intent returns conflict', async () => {
    const deps = mockPrepareDeps({
      findExistingSnapshot: async () => ({ id: 'snap-x', snapshotChecksumSha256: 'different-checksum-' + 'x'.repeat(45) }),
    });
    const r = await prepareWorkflowExecution(BASE_INPUT, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('66: no template = null template fields accepted', async () => {
    const input = { ...BASE_INPUT, templateId: undefined, templateVersionId: undefined };
    const r = await prepareWorkflowExecution(input, mockPrepareDeps());
    expect(r.success).toBe(true);
  });

  it('67: no asset = null asset fields accepted', async () => {
    const input = { ...BASE_INPUT, inputAssetId: undefined, inputAssetVersionId: undefined };
    const r = await prepareWorkflowExecution(input, mockPrepareDeps());
    expect(r.success).toBe(true);
  });
});

export { mockPrepareDeps, BASE_INPUT };
