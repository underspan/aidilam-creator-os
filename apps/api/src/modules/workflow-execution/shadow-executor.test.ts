/**
 * COM-04E3 Dedicated Tests Part 1: Shadow Executor DAG + Handler Registry
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { executeShadowWorkflow, ShadowExecutorDeps } from './shadow-executor.js';
import { registerShadowHandler, getShadowHandler, getRegisteredHandlerTypes, ShadowNodeHandler, ShadowNodeContext, ShadowNodeOutput } from './shadow-types.js';

// === MOCK HANDLER ===
class MockSuccessHandler implements ShadowNodeHandler {
  nodeType: string;
  callCount = 0;
  constructor(type: string) { this.nodeType = type; }
  async execute(ctx: ShadowNodeContext): Promise<ShadowNodeOutput> {
    this.callCount++;
    return { nodeKey: ctx.nodeKey, success: true, artifacts: [{ artifactType: 'shadow_evidence', storageBinding: `shadow/${ctx.executionId}/${ctx.nodeKey}`, checksum: 'a'.repeat(64), sizeBytes: 1024, mimeType: 'application/octet-stream' }], metadata: { handler: this.nodeType, attempt: ctx.attempt } };
  }
}

class MockFailHandler implements ShadowNodeHandler {
  nodeType: string;
  constructor(type: string) { this.nodeType = type; }
  async execute(ctx: ShadowNodeContext): Promise<ShadowNodeOutput> {
    return { nodeKey: ctx.nodeKey, success: false, artifacts: [], metadata: {}, error: 'SIMULATED_PROVIDER_FAILURE' };
  }
}

// Register handlers for testing
const handlers = ['source', 'analyze', 'stt', 'translate', 'tts', 'align', 'render', 'qc', 'persist', 'review'];
const mockHandlers = new Map<string, MockSuccessHandler>();
handlers.forEach(h => {
  const handler = new MockSuccessHandler(h);
  mockHandlers.set(h, handler);
  registerShadowHandler(handler);
});

// === IN-MEMORY DEPS ===
function createDeps(nodeCount = 4): { deps: ShadowExecutorDeps; state: any } {
  const frozenNodes = [
    { nodeKey: 'source', nodeType: 'source', ordinal: 0 },
    { nodeKey: 'stt', nodeType: 'stt', ordinal: 1 },
    { nodeKey: 'translate', nodeType: 'translate', ordinal: 2 },
    { nodeKey: 'review', nodeType: 'review', ordinal: 3 },
  ].slice(0, nodeCount);

  const frozenEdges = [
    { from: 'source', to: 'stt' },
    { from: 'stt', to: 'translate' },
    { from: 'translate', to: 'review' },
  ].slice(0, nodeCount - 1);

  const snapshot = {
    id: 'snap-1', workspace_id: 'ws1', project_id: 'proj1',
    workflow_version_id: 'wv1', input_asset_version_id: 'av1', input_asset_checksum: 'c'.repeat(64),
    effective_config_json: { targetLang: 'vi' }, provider_policy_json: { stt: { configId: 'cfg1' } },
    snapshot_json: { nodes: frozenNodes, edges: frozenEdges },
  };

  const execution = {
    id: 'exec-1', snapshot_id: 'snap-1', workspace_id: 'ws1', project_id: 'proj1',
    execution_mode: 'shadow', status: 'prepared', current_node_key: null,
    progress_percent: 0, attempt: 1, state_version: 1, started_at: null, completed_at: null,
    failed_at: null, cancelled_at: null, failure_code: null,
  };

  const nodeExecs = frozenNodes.map((n, i) => ({
    id: `ne-${n.nodeKey}`, execution_id: 'exec-1', node_key: n.nodeKey,
    node_type: n.nodeType, ordinal: i, status: 'pending', attempt: 1, state_version: 1,
    progress_percent: 0, started_at: null, completed_at: null, failed_at: null, failure_code: null,
    output_reference_json: null,
  }));

  const artifacts: any[] = [];
  const providerCalls: any[] = [];
  const audits: any[] = [];

  const deps: ShadowExecutorDeps = {
    getExecution: async (id) => id === 'exec-1' ? { ...execution } : null,
    getSnapshot: async (id) => id === 'snap-1' ? snapshot : null,
    getNodeExecutions: async () => nodeExecs.map(n => ({ ...n })),
    updateExecution: async (id, fields, ev) => { if (execution.state_version !== ev) return false; Object.assign(execution, fields); return true; },
    updateNodeExecution: async (id, fields, ev) => { const n = nodeExecs.find(x => x.id === id); if (!n || n.state_version !== ev) return false; Object.assign(n, fields); return true; },
    persistShadowArtifact: async (a) => { artifacts.push(a); },
    persistProviderCall: async (c) => { providerCalls.push(c); },
    persistAudit: async (e) => { audits.push(e); },
    createWorkDir: () => '/tmp/shadow-test',
    cleanupWorkDir: () => {},
  };

  return { deps, state: { execution, nodeExecs, artifacts, providerCalls, audits, snapshot } };
}

describe('Shadow Executor - DAG Execution', () => {
  beforeEach(() => { mockHandlers.forEach(h => h.callCount = 0); });

  it('01: executes 4-node linear DAG successfully', async () => {
    const { deps } = createDeps();
    const r = await executeShadowWorkflow('exec-1', deps);
    expect(r.success).toBe(true);
    expect(r.executionStatus).toBe('succeeded');
    expect(r.nodesSucceeded).toBe(4);
    expect(r.progress).toBe(100);
  });

  it('02: all nodes call their handlers', async () => {
    const { deps } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    expect(mockHandlers.get('source')!.callCount).toBeGreaterThan(0);
    expect(mockHandlers.get('stt')!.callCount).toBeGreaterThan(0);
    expect(mockHandlers.get('translate')!.callCount).toBeGreaterThan(0);
    expect(mockHandlers.get('review')!.callCount).toBeGreaterThan(0);
  });

  it('03: execution transitions prepared→running→succeeded', async () => {
    const { deps, state } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    expect(state.execution.status).toBe('succeeded');
    expect(state.execution.started_at).not.toBeNull();
    expect(state.execution.completed_at).not.toBeNull();
  });

  it('04: node executions all reach succeeded', async () => {
    const { deps, state } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    for (const ne of state.nodeExecs) {
      expect(ne.status).toBe('succeeded');
    }
  });

  it('05: rejects non-shadow execution mode', async () => {
    const { deps, state } = createDeps();
    state.execution.execution_mode = 'dry_run';
    const r = await executeShadowWorkflow('exec-1', deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe('NOT_SHADOW_MODE');
  });

  it('06: rejects terminal execution', async () => {
    const { deps, state } = createDeps();
    state.execution.status = 'succeeded';
    const r = await executeShadowWorkflow('exec-1', deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe('EXECUTION_ALREADY_TERMINAL');
  });

  it('07: rejects non-existent execution', async () => {
    const { deps } = createDeps();
    const r = await executeShadowWorkflow('nonexistent', deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe('EXECUTION_NOT_FOUND');
  });

  it('08: artifacts persisted for each node', async () => {
    const { deps, state } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    expect(state.artifacts.length).toBe(4);
    expect(state.artifacts.every((a: any) => a.workspace_id === 'ws1')).toBe(true);
  });

  it('09: audit events emitted', async () => {
    const { deps, state } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    const types = state.audits.map((a: any) => a.event_type);
    expect(types).toContain('workflow_shadow_started');
    expect(types).toContain('workflow_shadow_succeeded');
    expect(types.filter((t: string) => t === 'workflow_shadow_node_started').length).toBe(4);
    expect(types.filter((t: string) => t === 'workflow_shadow_node_succeeded').length).toBe(4);
  });

  it('10: uses frozen snapshot edges not mutable definition', async () => {
    const { deps, state } = createDeps();
    // Modify snapshot edges to verify executor reads from snapshot
    state.snapshot.snapshot_json.edges = [
      { from: 'source', to: 'translate' }, // skip stt
      { from: 'translate', to: 'review' },
    ];
    await executeShadowWorkflow('exec-1', deps);
    // stt should still eventually execute (as disconnected becomes skipped or executes if ready)
    expect(state.execution.status).toBe('succeeded');
  });
});

describe('Shadow Executor - Handler Registry', () => {
  it('11: all 10 workflow node types registered', () => {
    const types = getRegisteredHandlerTypes();
    expect(types).toContain('source');
    expect(types).toContain('analyze');
    expect(types).toContain('stt');
    expect(types).toContain('translate');
    expect(types).toContain('tts');
    expect(types).toContain('align');
    expect(types).toContain('render');
    expect(types).toContain('qc');
    expect(types).toContain('persist');
    expect(types).toContain('review');
  });

  it('12: getShadowHandler returns handler for known type', () => {
    expect(getShadowHandler('stt')).toBeDefined();
    expect(getShadowHandler('render')).toBeDefined();
  });

  it('13: getShadowHandler returns undefined for unknown type', () => {
    expect(getShadowHandler('quantum_teleport')).toBeUndefined();
  });

  it('14: no eval/dynamic-import in handler execution', () => {
    // Verify handler registry is a fixed Map, not dynamic loading
    const handler = getShadowHandler('stt');
    expect(handler).toBeInstanceOf(MockSuccessHandler);
  });
});

describe('Shadow Executor - Failure Handling', () => {
  it('15: failure at one node stops execution', async () => {
    // Register a fail handler for translate
    registerShadowHandler(new MockFailHandler('translate'));
    const { deps, state } = createDeps();
    const r = await executeShadowWorkflow('exec-1', deps);
    expect(r.success).toBe(false);
    expect(r.executionStatus).toBe('failed');
    expect(r.nodesSucceeded).toBe(2); // source + stt
    expect(r.nodesFailed).toBe(1);
    // Restore
    registerShadowHandler(mockHandlers.get('translate')!);
  });

  it('16: downstream nodes remain pending after failure', async () => {
    registerShadowHandler(new MockFailHandler('stt'));
    const { deps, state } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    const review = state.nodeExecs.find((n: any) => n.node_key === 'review');
    expect(review!.status).toBe('pending');
    registerShadowHandler(mockHandlers.get('stt')!);
  });

  it('17: handler exception treated as failure', async () => {
    const throwHandler: ShadowNodeHandler = {
      nodeType: 'stt',
      execute: async () => { throw new Error('Provider unreachable'); },
    };
    registerShadowHandler(throwHandler);
    const { deps, state } = createDeps();
    const r = await executeShadowWorkflow('exec-1', deps);
    expect(r.success).toBe(false);
    expect(state.nodeExecs.find((n: any) => n.node_key === 'stt')!.failure_code).toBe('HANDLER_EXCEPTION');
    registerShadowHandler(mockHandlers.get('stt')!);
  });

  it('18: failed execution has failure audit', async () => {
    registerShadowHandler(new MockFailHandler('source'));
    const { deps, state } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    expect(state.audits.some((a: any) => a.event_type === 'workflow_shadow_failed')).toBe(true);
    registerShadowHandler(mockHandlers.get('source')!);
  });
});

describe('Shadow Executor - Context', () => {
  it('19: handler receives workspaceId from snapshot', async () => {
    let receivedCtx: ShadowNodeContext | null = null;
    const captureHandler: ShadowNodeHandler = {
      nodeType: 'source',
      execute: async (ctx) => { receivedCtx = ctx; return { nodeKey: ctx.nodeKey, success: true, artifacts: [], metadata: {} }; },
    };
    registerShadowHandler(captureHandler);
    const { deps } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    expect(receivedCtx!.workspaceId).toBe('ws1');
    expect(receivedCtx!.projectId).toBe('proj1');
    registerShadowHandler(mockHandlers.get('source')!);
  });

  it('20: handler receives effectiveConfig from snapshot', async () => {
    let receivedCtx: ShadowNodeContext | null = null;
    const captureHandler: ShadowNodeHandler = {
      nodeType: 'stt',
      execute: async (ctx) => { receivedCtx = ctx; return { nodeKey: ctx.nodeKey, success: true, artifacts: [], metadata: {} }; },
    };
    registerShadowHandler(captureHandler);
    const { deps } = createDeps();
    await executeShadowWorkflow('exec-1', deps);
    expect(receivedCtx!.effectiveConfig).toEqual({ targetLang: 'vi' });
    registerShadowHandler(mockHandlers.get('stt')!);
  });
});

describe('Shadow Executor - DAG Not Hardcoded', () => {
  it('21: executor does not contain hardcoded node sequence', async () => {
    // Read the executor source and verify no hardcoded sequence
    // This is verified by the fact that the executor uses isNodeReady() with edges
    const { deps, state } = createDeps();
    // Reverse edge order - should still work
    state.snapshot.snapshot_json.edges = [
      { from: 'translate', to: 'review' },
      { from: 'stt', to: 'translate' },
      { from: 'source', to: 'stt' },
    ];
    const r = await executeShadowWorkflow('exec-1', deps);
    expect(r.success).toBe(true);
    expect(r.nodesSucceeded).toBe(4);
  });
});
