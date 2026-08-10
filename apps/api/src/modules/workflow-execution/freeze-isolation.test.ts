/**
 * COM-04E2 Dedicated Tests Part 5: Freeze Proofs, Isolation, Invariants, Security
 */
import { describe, it, expect } from 'vitest';
import { prepareWorkflowExecution, PrepareExecutionDeps } from './prepare-service.js';
import { hashExecutionSnapshot } from './snapshot-hash.js';
import { ExecutionStatus, NodeStatus, EXECUTION_TRANSITIONS, NODE_TRANSITIONS, TERMINAL_EXECUTION_STATES } from './types.js';

// Reuse mock factory
function mockDeps(overrides: Partial<PrepareExecutionDeps> = {}): PrepareExecutionDeps {
  return {
    getWorkflowVersion: async () => ({ id: 'wv1', workflow_definition_id: 'wd1', version_number: 1, checksum_sha256: 'a'.repeat(64), configuration_json: {} }),
    getWorkflowNodes: async () => [
      { node_key: 'source', node_type: 'source', position_index: 0 },
      { node_key: 'review', node_type: 'review', position_index: 1 },
    ],
    getWorkflowEdges: async () => [{ from_node_key: 'source', to_node_key: 'review', edge_type: 'success' }],
    getTemplateVersion: async () => ({ id: 'tv1', template_id: 't1', config_checksum: 'b'.repeat(64), config_json: {} }),
    getAssetVersion: async () => ({ id: 'av1', asset_id: 'a1', checksum_sha256: 'c'.repeat(64) }),
    getProviderPolicy: async () => ({ stt: { configId: 'cfg1' } }),
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

describe('Workflow Version Freeze', () => {
  it('91: snapshot checksum uses workflow version checksum', async () => {
    const persisted: any[] = [];
    const deps = mockDeps({ persistSnapshot: async (s) => { persisted.push(s); } });
    await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', effectiveConfig: {}, actorId: 'u1' }, deps);
    expect(persisted[0].workflow_checksum).toBe('a'.repeat(64));
  });

  it('92: changing workflow version produces different snapshot checksum', () => {
    const base = { schemaVersion: '1.0', workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'v1', workflowVersionNumber: 1, workflowChecksum: 'a'.repeat(64), templateId: null, templateVersionId: null, templateChecksum: null, inputAssetId: null, inputAssetVersionId: null, inputAssetChecksum: null, effectiveConfigChecksum: 'x'.repeat(64), providerPolicyChecksum: 'y'.repeat(64), runtimePolicyJson: { maxRetries: 3, timeoutSeconds: 3600, cancelPolicy: 'immediate' } };
    const h1 = hashExecutionSnapshot(base);
    const h2 = hashExecutionSnapshot({ ...base, workflowVersionId: 'v2', workflowVersionNumber: 2 });
    expect(h1).not.toBe(h2);
  });
});

describe('Template Version Freeze', () => {
  it('93: template checksum captured in snapshot', async () => {
    const persisted: any[] = [];
    const deps = mockDeps({ persistSnapshot: async (s) => { persisted.push(s); } });
    await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', templateId: 't1', templateVersionId: 'tv1', effectiveConfig: {}, actorId: 'u1' }, deps);
    expect(persisted[0].template_checksum).toBe('b'.repeat(64));
  });

  it('94: different template version produces different checksum', () => {
    const base = { schemaVersion: '1.0', workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'v1', workflowVersionNumber: 1, workflowChecksum: 'a'.repeat(64), templateId: 't1', templateVersionId: 'tv1', templateChecksum: 'b'.repeat(64), inputAssetId: null, inputAssetVersionId: null, inputAssetChecksum: null, effectiveConfigChecksum: 'x'.repeat(64), providerPolicyChecksum: 'y'.repeat(64), runtimePolicyJson: { maxRetries: 3, timeoutSeconds: 3600, cancelPolicy: 'immediate' } };
    const h1 = hashExecutionSnapshot(base);
    const h2 = hashExecutionSnapshot({ ...base, templateVersionId: 'tv2', templateChecksum: 'z'.repeat(64) });
    expect(h1).not.toBe(h2);
  });
});

describe('Provider Policy Freeze', () => {
  it('95: provider policy captured in snapshot', async () => {
    const persisted: any[] = [];
    const deps = mockDeps({
      getProviderPolicy: async () => ({ stt: { configId: 'cfg1', revision: 'r1' } }),
      persistSnapshot: async (s) => { persisted.push(s); },
    });
    await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', effectiveConfig: {}, actorId: 'u1' }, deps);
    expect(persisted[0].provider_policy_json).toEqual({ stt: { configId: 'cfg1', revision: 'r1' } });
  });

  it('96: different provider policy produces different snapshot checksum', async () => {
    const persisted1: any[] = [];
    const persisted2: any[] = [];
    const deps1 = mockDeps({ getProviderPolicy: async () => ({ stt: { configId: 'cfg1' } }), persistSnapshot: async (s) => { persisted1.push(s); } });
    const deps2 = mockDeps({ getProviderPolicy: async () => ({ stt: { configId: 'cfg2' } }), persistSnapshot: async (s) => { persisted2.push(s); } });
    await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', effectiveConfig: {}, actorId: 'u1' }, deps1);
    await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', effectiveConfig: {}, actorId: 'u1' }, deps2);
    expect(persisted1[0].snapshot_checksum_sha256).not.toBe(persisted2[0].snapshot_checksum_sha256);
  });
});

describe('Input Asset Version Freeze', () => {
  it('97: asset version checksum captured', async () => {
    const persisted: any[] = [];
    const deps = mockDeps({ persistSnapshot: async (s) => { persisted.push(s); } });
    await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', inputAssetId: 'a1', inputAssetVersionId: 'av1', effectiveConfig: {}, actorId: 'u1' }, deps);
    expect(persisted[0].input_asset_checksum).toBe('c'.repeat(64));
    expect(persisted[0].input_asset_version_id).toBe('av1');
  });

  it('98: different asset version produces different checksum', () => {
    const base = { schemaVersion: '1.0', workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'v1', workflowVersionNumber: 1, workflowChecksum: 'a'.repeat(64), templateId: null, templateVersionId: null, templateChecksum: null, inputAssetId: 'a1', inputAssetVersionId: 'av1', inputAssetChecksum: 'c'.repeat(64), effectiveConfigChecksum: 'x'.repeat(64), providerPolicyChecksum: 'y'.repeat(64), runtimePolicyJson: { maxRetries: 3, timeoutSeconds: 3600, cancelPolicy: 'immediate' } };
    const h1 = hashExecutionSnapshot(base);
    const h2 = hashExecutionSnapshot({ ...base, inputAssetVersionId: 'av2', inputAssetChecksum: 'd'.repeat(64) });
    expect(h1).not.toBe(h2);
  });
});

describe('Snapshot Security - No Secrets', () => {
  it('99: provider policy must not contain secrets', async () => {
    const persisted: any[] = [];
    const deps = mockDeps({
      getProviderPolicy: async () => ({ stt: { configId: 'cfg1', definitionId: 'def1' } }),
      persistSnapshot: async (s) => { persisted.push(s); },
    });
    await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', effectiveConfig: {}, actorId: 'u1' }, deps);
    const json = JSON.stringify(persisted[0]);
    expect(json).not.toContain('apiKey');
    expect(json).not.toContain('password');
    expect(json).not.toContain('token');
    expect(json).not.toContain('secret');
    expect(json).not.toContain('PRIVATE_KEY');
  });

  it('100: effective config should not leak credentials', async () => {
    const persisted: any[] = [];
    const deps = mockDeps({ persistSnapshot: async (s) => { persisted.push(s); } });
    await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', effectiveConfig: { targetLang: 'vi', sourceLang: 'zh' }, actorId: 'u1' }, deps);
    const json = JSON.stringify(persisted[0].effective_config_json);
    expect(json).not.toContain('apiKey');
    expect(json).not.toContain('MINIO');
  });
});

describe('Isolation Contracts', () => {
  it('101: cross-workspace membership denied', async () => {
    const deps = mockDeps({ checkWorkspaceMembership: async () => false });
    const r = await prepareWorkflowExecution({ workspaceId: 'ws-foreign', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', effectiveConfig: {}, actorId: 'u1' }, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('ACCESS_DENIED');
  });

  it('102: cross-project access denied', async () => {
    const deps = mockDeps({ checkProjectAccess: async () => false });
    const r = await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'foreign-proj', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', effectiveConfig: {}, actorId: 'u1' }, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('PROJECT_ACCESS_DENIED');
  });

  it('103: cross-workspace asset denied', async () => {
    const deps = mockDeps({ checkAssetBelongsToWorkspace: async () => false });
    const r = await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd1', workflowVersionId: 'wv1', inputAssetId: 'a-foreign', inputAssetVersionId: 'av-foreign', effectiveConfig: {}, actorId: 'u1' }, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('ASSET_ACCESS_DENIED');
  });

  it('104: non-visible workflow denied', async () => {
    const deps = mockDeps({ checkWorkflowVisibility: async () => false });
    const r = await prepareWorkflowExecution({ workspaceId: 'ws1', projectId: 'p1', workflowDefinitionId: 'wd-foreign', workflowVersionId: 'wv1', effectiveConfig: {}, actorId: 'u1' }, deps);
    expect(r.success).toBe(false);
    expect(r.error!.code).toBe('WORKFLOW_NOT_VISIBLE');
  });
});

describe('State Invariants', () => {
  it('105: all execution terminal states are truly terminal', () => {
    for (const state of TERMINAL_EXECUTION_STATES) {
      expect(EXECUTION_TRANSITIONS[state]).toEqual([]);
    }
  });

  it('106: no path from succeeded back to running', () => {
    expect(EXECUTION_TRANSITIONS['succeeded']).not.toContain('running');
  });

  it('107: no path from cancelled back to running', () => {
    expect(EXECUTION_TRANSITIONS['cancelled']).not.toContain('running');
  });

  it('108: failed → ready only for nodes (retry)', () => {
    expect(NODE_TRANSITIONS['failed']).toEqual(['ready']);
  });

  it('109: succeeded node is terminal', () => {
    expect(NODE_TRANSITIONS['succeeded']).toEqual([]);
  });

  it('110: cancelled node is terminal', () => {
    expect(NODE_TRANSITIONS['cancelled']).toEqual([]);
  });
});
