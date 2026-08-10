/**
 * COM-04E2 Dedicated Tests Part 4: Dry-Run Harness + Cancel + Retry
 */
import { describe, it, expect } from 'vitest';
import { runDryExecution, cancelExecution, retryNode, DryRunDeps } from './dry-run-harness.js';
import { WorkflowExecution, NodeExecution, NodeStatus, ExecutionStatus } from './types.js';

// In-memory state for dry-run tests
function createInMemoryDeps(nodeCount: number = 4): { deps: DryRunDeps; state: any } {
  const edges = [
    { from: 'source', to: 'stt' },
    { from: 'stt', to: 'translate' },
    { from: 'translate', to: 'review' },
  ];
  const nodeKeys = ['source', 'stt', 'translate', 'review'].slice(0, nodeCount);

  const execution: WorkflowExecution = {
    id: 'exec-1', snapshotId: 'snap-1', workspaceId: 'ws1', projectId: 'proj1',
    executionMode: 'dry_run', status: 'prepared', currentNodeKey: null,
    progressPercent: 0, attempt: 1, stateVersion: 1,
    cancelRequestedAt: null, startedAt: null, completedAt: null,
    failedAt: null, cancelledAt: null, failureCode: null, failureMessage: null,
    createdAt: new Date(), updatedAt: new Date(),
  };

  const nodes: NodeExecution[] = nodeKeys.map((key, i) => ({
    id: `node-${key}`, executionId: 'exec-1', nodeKey: key,
    nodeType: key, ordinal: i, status: 'pending' as NodeStatus,
    attempt: 1, stateVersion: 1, progressPercent: 0,
    startedAt: null, completedAt: null, failedAt: null,
    failureCode: null, inputReferenceJson: null, outputReferenceJson: null,
    createdAt: new Date(), updatedAt: new Date(),
  }));

  const audits: any[] = [];

  const deps: DryRunDeps = {
    getExecution: async (id) => id === execution.id ? { ...execution } : null,
    getNodeExecutions: async () => nodes.map(n => ({ ...n })),
    getSnapshotEdges: async () => edges,
    updateExecution: async (id, fields, expectedVersion) => {
      if (execution.stateVersion !== expectedVersion) return false;
      Object.assign(execution, fields);
      return true;
    },
    updateNodeExecution: async (id, fields, expectedVersion) => {
      const node = nodes.find(n => n.id === id);
      if (!node || node.stateVersion !== expectedVersion) return false;
      Object.assign(node, fields);
      return true;
    },
    persistAudit: async (event) => { audits.push(event); },
  };

  return { deps, state: { execution, nodes, audits, edges } };
}

describe('Dry-Run Execution - Success', () => {
  it('68: complete dry-run succeeds with 4 nodes', async () => {
    const { deps } = createInMemoryDeps();
    const r = await runDryExecution('exec-1', deps);
    expect(r.success).toBe(true);
    expect(r.executionStatus).toBe('succeeded');
    expect(r.nodesSucceeded).toBe(4);
    expect(r.nodesFailed).toBe(0);
    expect(r.progress).toBe(100);
  });

  it('69: all nodes reach succeeded status', async () => {
    const { deps, state } = createInMemoryDeps();
    await runDryExecution('exec-1', deps);
    for (const node of state.nodes) {
      expect(node.status).toBe('succeeded');
    }
  });

  it('70: execution transitions prepared→running→succeeded', async () => {
    const { deps, state } = createInMemoryDeps();
    await runDryExecution('exec-1', deps);
    expect(state.execution.status).toBe('succeeded');
    expect(state.execution.startedAt).not.toBeNull();
    expect(state.execution.completedAt).not.toBeNull();
  });

  it('71: progress reaches 100%', async () => {
    const { deps, state } = createInMemoryDeps();
    await runDryExecution('exec-1', deps);
    expect(state.execution.progressPercent).toBe(100);
  });

  it('72: audit events emitted for start + each node + completion', async () => {
    const { deps, state } = createInMemoryDeps();
    await runDryExecution('exec-1', deps);
    const types = state.audits.map((a: any) => a.event_type);
    expect(types).toContain('workflow_execution_started');
    expect(types).toContain('workflow_execution_succeeded');
    expect(types.filter((t: string) => t === 'workflow_node_started').length).toBe(4);
    expect(types.filter((t: string) => t === 'workflow_node_succeeded').length).toBe(4);
  });

  it('73: output_reference_json set on succeeded nodes (dry_run marker)', async () => {
    const { deps, state } = createInMemoryDeps();
    await runDryExecution('exec-1', deps);
    for (const node of state.nodes) {
      expect(node.outputReferenceJson).toBeDefined();
      expect((node.outputReferenceJson as any).dryRun).toBe(true);
    }
  });
});

describe('Dry-Run Execution - Failure Injection', () => {
  it('74: failure at translate stops downstream', async () => {
    const { deps, state } = createInMemoryDeps();
    const r = await runDryExecution('exec-1', deps, { nodeKey: 'translate', failureCode: 'SIMULATED_FAILURE' });
    expect(r.success).toBe(true);
    expect(r.executionStatus).toBe('failed');
    expect(r.nodesSucceeded).toBe(2); // source + stt
    expect(r.nodesFailed).toBe(1); // translate
  });

  it('75: downstream node remains pending after failure', async () => {
    const { deps, state } = createInMemoryDeps();
    await runDryExecution('exec-1', deps, { nodeKey: 'translate', failureCode: 'TEST' });
    const review = state.nodes.find((n: any) => n.nodeKey === 'review');
    expect(review!.status).toBe('pending');
  });

  it('76: execution has failure_code set', async () => {
    const { deps, state } = createInMemoryDeps();
    await runDryExecution('exec-1', deps, { nodeKey: 'stt', failureCode: 'STT_SIMULATED' });
    expect(state.execution.failureCode).toBe('STT_SIMULATED');
    expect(state.execution.failedAt).not.toBeNull();
  });

  it('77: failure audit emitted', async () => {
    const { deps, state } = createInMemoryDeps();
    await runDryExecution('exec-1', deps, { nodeKey: 'stt', failureCode: 'X' });
    const failAudit = state.audits.find((a: any) => a.event_type === 'workflow_node_failed');
    expect(failAudit).toBeDefined();
    expect(failAudit.node_key).toBe('stt');
  });
});

describe('Cancellation', () => {
  it('78: cancel prepared execution', async () => {
    const { deps } = createInMemoryDeps();
    const r = await cancelExecution('exec-1', deps);
    expect(r.success).toBe(true);
    expect(r.status).toBe('cancelled');
  });

  it('79: cancel running execution', async () => {
    const { deps, state } = createInMemoryDeps();
    // Manually set to running
    state.execution.status = 'running';
    state.execution.stateVersion = 2;
    const r = await cancelExecution('exec-1', deps);
    expect(r.success).toBe(true);
    expect(r.status).toBe('cancelled');
  });

  it('80: cancel idempotent on terminal', async () => {
    const { deps, state } = createInMemoryDeps();
    state.execution.status = 'succeeded';
    state.execution.stateVersion = 5;
    const r = await cancelExecution('exec-1', deps);
    expect(r.success).toBe(true);
    expect(r.status).toBe('succeeded');
  });

  it('81: pending nodes cancelled after execution cancel', async () => {
    const { deps, state } = createInMemoryDeps();
    state.execution.status = 'running';
    state.execution.stateVersion = 2;
    state.nodes[0].status = 'succeeded';
    state.nodes[0].stateVersion = 3;
    await cancelExecution('exec-1', deps);
    expect(state.nodes[1].status).toBe('cancelled');
    expect(state.nodes[2].status).toBe('cancelled');
    expect(state.nodes[3].status).toBe('cancelled');
  });

  it('82: cancel audit emitted', async () => {
    const { deps, state } = createInMemoryDeps();
    await cancelExecution('exec-1', deps);
    expect(state.audits.some((a: any) => a.event_type === 'workflow_execution_cancelled')).toBe(true);
  });
});

describe('Retry', () => {
  it('83: retry failed node resets to ready', async () => {
    const { deps, state } = createInMemoryDeps();
    state.nodes[1].status = 'failed';
    state.nodes[1].stateVersion = 3;
    state.nodes[1].failureCode = 'SIMULATED';
    const r = await retryNode('exec-1', 'stt', 3, deps);
    expect(r.success).toBe(true);
    expect(r.attempt).toBe(2);
    expect(state.nodes[1].status).toBe('ready');
  });

  it('84: retry increments attempt', async () => {
    const { deps, state } = createInMemoryDeps();
    state.nodes[1].status = 'failed';
    state.nodes[1].stateVersion = 3;
    state.nodes[1].attempt = 2;
    const r = await retryNode('exec-1', 'stt', 3, deps);
    expect(r.success).toBe(true);
    expect(r.attempt).toBe(3);
  });

  it('85: retry exhausted returns error', async () => {
    const { deps, state } = createInMemoryDeps();
    state.nodes[1].status = 'failed';
    state.nodes[1].stateVersion = 3;
    state.nodes[1].attempt = 3;
    const r = await retryNode('exec-1', 'stt', 3, deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe('MAX_ATTEMPTS_EXHAUSTED');
  });

  it('86: retry non-failed node rejected', async () => {
    const { deps, state } = createInMemoryDeps();
    state.nodes[1].status = 'succeeded';
    const r = await retryNode('exec-1', 'stt', 3, deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe('NODE_NOT_FAILED');
  });

  it('87: retry audit emitted', async () => {
    const { deps, state } = createInMemoryDeps();
    state.nodes[1].status = 'failed';
    state.nodes[1].stateVersion = 3;
    await retryNode('exec-1', 'stt', 3, deps);
    expect(state.audits.some((a: any) => a.event_type === 'workflow_execution_retry_requested')).toBe(true);
  });
});

describe('Terminal Idempotency', () => {
  it('88: running dry-run on terminal execution fails gracefully', async () => {
    const { deps, state } = createInMemoryDeps();
    state.execution.status = 'succeeded';
    state.execution.stateVersion = 10;
    const r = await runDryExecution('exec-1', deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe('EXECUTION_ALREADY_TERMINAL');
  });

  it('89: cancel on already-cancelled is idempotent', async () => {
    const { deps, state } = createInMemoryDeps();
    state.execution.status = 'cancelled';
    const r = await cancelExecution('exec-1', deps);
    expect(r.success).toBe(true);
    expect(r.status).toBe('cancelled');
  });

  it('90: not-found execution returns error', async () => {
    const { deps } = createInMemoryDeps();
    const r = await runDryExecution('nonexistent', deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe('EXECUTION_NOT_FOUND');
  });
});
