/**
 * DAG-Driven Dry-Run Harness
 * AIDILAM-COM-04E2
 *
 * Advances execution state through the workflow graph topologically.
 * Does NOT call any business logic, providers, or create real outputs.
 * Proves state machine transitions and DAG topology only.
 */
import {
  ExecutionStatus, NodeStatus, WorkflowExecution, NodeExecution,
  TERMINAL_EXECUTION_STATES,
} from './types.js';
import {
  transitionWorkflowExecution, transitionNodeExecution,
  isNodeReady, calculateProgress,
} from './state-machine.js';

export interface DryRunDeps {
  getExecution(executionId: string): Promise<WorkflowExecution | null>;
  getNodeExecutions(executionId: string): Promise<NodeExecution[]>;
  getSnapshotEdges(snapshotId: string): Promise<Array<{ from: string; to: string }>>;
  updateExecution(id: string, fields: Partial<WorkflowExecution>, expectedVersion: number): Promise<boolean>;
  updateNodeExecution(id: string, fields: Partial<NodeExecution>, expectedVersion: number): Promise<boolean>;
  persistAudit(event: any): Promise<void>;
}

export interface DryRunResult {
  success: boolean;
  error?: string;
  executionStatus: ExecutionStatus;
  nodesSucceeded: number;
  nodesFailed: number;
  nodesCancelled: number;
  progress: number;
}

export interface FailureInjection {
  nodeKey: string;
  failureCode: string;
}

/**
 * Run a complete dry-run execution through the DAG.
 * Each node transitions: pending → ready → running → succeeded (or failed if injected).
 * Advances topologically based on edge dependencies.
 */
export async function runDryExecution(
  executionId: string,
  deps: DryRunDeps,
  failureInjection?: FailureInjection
): Promise<DryRunResult> {
  const exec = await deps.getExecution(executionId);
  if (!exec) return { success: false, error: 'EXECUTION_NOT_FOUND', executionStatus: 'failed', nodesSucceeded: 0, nodesFailed: 0, nodesCancelled: 0, progress: 0 };

  if (TERMINAL_EXECUTION_STATES.includes(exec.status)) {
    return { success: false, error: 'EXECUTION_ALREADY_TERMINAL', executionStatus: exec.status, nodesSucceeded: 0, nodesFailed: 0, nodesCancelled: 0, progress: exec.progressPercent };
  }

  // Start execution
  const startTx = transitionWorkflowExecution(exec.status, 'running', exec.stateVersion, exec.stateVersion);
  if (!startTx.success) return { success: false, error: startTx.error, executionStatus: exec.status, nodesSucceeded: 0, nodesFailed: 0, nodesCancelled: 0, progress: 0 };

  await deps.updateExecution(executionId, {
    status: 'running',
    startedAt: new Date(),
    stateVersion: exec.stateVersion + 1,
    updatedAt: new Date(),
  }, exec.stateVersion);

  await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_execution_started', detail_json: {} });

  let currentExecVersion = exec.stateVersion + 1;
  const nodes = await deps.getNodeExecutions(executionId);
  const edges = await deps.getSnapshotEdges(exec.snapshotId);
  const edgesArr = edges.map(e => ({ from_node_key: e.from, to_node_key: e.to }));

  // Build node map
  const nodeMap = new Map<string, NodeExecution>();
  const nodeStatuses = new Map<string, NodeStatus>();
  for (const n of nodes) {
    nodeMap.set(n.nodeKey, n);
    nodeStatuses.set(n.nodeKey, n.status);
  }

  // Topological processing
  let nodesSucceeded = 0;
  let nodesFailed = 0;
  let nodesCancelled = 0;
  let executionFailed = false;

  // Process nodes in ordinal order, but only advance when ready
  const sortedNodes = [...nodes].sort((a, b) => a.ordinal - b.ordinal);
  const maxIterations = sortedNodes.length * 3; // safety cap
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    let advanced = false;

    for (const node of sortedNodes) {
      const currentNodeStatus = nodeStatuses.get(node.nodeKey)!;

      // Skip terminal nodes
      if (['succeeded', 'failed', 'skipped', 'cancelled'].includes(currentNodeStatus)) continue;

      // Check if should be cancelled due to execution failure
      if (executionFailed && currentNodeStatus !== 'running') {
        // Leave as pending (not executed)
        continue;
      }

      // pending → ready if predecessors satisfied
      if (currentNodeStatus === 'pending') {
        if (isNodeReady(node.nodeKey, edgesArr, nodeStatuses)) {
          const nodeExec = nodeMap.get(node.nodeKey)!;
          await deps.updateNodeExecution(nodeExec.id, { status: 'ready', stateVersion: nodeExec.stateVersion + 1, updatedAt: new Date() }, nodeExec.stateVersion);
          nodeExec.stateVersion++;
          nodeStatuses.set(node.nodeKey, 'ready');
          advanced = true;
        }
        continue;
      }

      // ready → running
      if (currentNodeStatus === 'ready') {
        const nodeExec = nodeMap.get(node.nodeKey)!;
        await deps.updateNodeExecution(nodeExec.id, { status: 'running', startedAt: new Date(), stateVersion: nodeExec.stateVersion + 1, updatedAt: new Date() }, nodeExec.stateVersion);
        nodeExec.stateVersion++;
        nodeStatuses.set(node.nodeKey, 'running');

        // Update execution current_node_key
        await deps.updateExecution(executionId, { currentNodeKey: node.nodeKey, updatedAt: new Date(), stateVersion: currentExecVersion + 1 }, currentExecVersion);
        currentExecVersion++;

        await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_node_started', node_key: node.nodeKey, detail_json: { attempt: nodeExec.attempt } });
        advanced = true;
        continue;
      }

      // running → succeeded or failed
      if (currentNodeStatus === 'running') {
        const nodeExec = nodeMap.get(node.nodeKey)!;

        // Check failure injection
        if (failureInjection && failureInjection.nodeKey === node.nodeKey) {
          await deps.updateNodeExecution(nodeExec.id, {
            status: 'failed', failedAt: new Date(), failureCode: failureInjection.failureCode,
            stateVersion: nodeExec.stateVersion + 1, updatedAt: new Date(),
          }, nodeExec.stateVersion);
          nodeExec.stateVersion++;
          nodeStatuses.set(node.nodeKey, 'failed');
          nodesFailed++;
          executionFailed = true;
          await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_node_failed', node_key: node.nodeKey, detail_json: { failureCode: failureInjection.failureCode } });
        } else {
          // Dry-run success (no real work)
          await deps.updateNodeExecution(nodeExec.id, {
            status: 'succeeded', completedAt: new Date(), progressPercent: 100,
            outputReferenceJson: { dryRun: true, simulatedAt: new Date().toISOString() },
            stateVersion: nodeExec.stateVersion + 1, updatedAt: new Date(),
          }, nodeExec.stateVersion);
          nodeExec.stateVersion++;
          nodeStatuses.set(node.nodeKey, 'succeeded');
          nodesSucceeded++;
          await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_node_succeeded', node_key: node.nodeKey, detail_json: {} });
        }

        // Update progress
        const progress = calculateProgress(nodeStatuses);
        await deps.updateExecution(executionId, { progressPercent: progress, updatedAt: new Date(), stateVersion: currentExecVersion + 1 }, currentExecVersion);
        currentExecVersion++;
        advanced = true;
        continue;
      }
    }

    // Check if all done
    const allTerminal = [...nodeStatuses.values()].every(s => ['succeeded', 'failed', 'skipped', 'cancelled', 'pending'].includes(s));
    const anyRunning = [...nodeStatuses.values()].some(s => s === 'running' || s === 'ready');

    if (!anyRunning && !advanced) break;
    if (!advanced) break; // No progress possible (deadlock or done)
  }

  // Determine final execution status
  let finalStatus: ExecutionStatus;
  if (executionFailed) {
    finalStatus = 'failed';
    await deps.updateExecution(executionId, {
      status: 'failed', failedAt: new Date(), failureCode: failureInjection?.failureCode || 'NODE_FAILED',
      progressPercent: calculateProgress(nodeStatuses),
      stateVersion: currentExecVersion + 1, updatedAt: new Date(),
    }, currentExecVersion);
    await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_execution_failed', detail_json: { nodesFailed } });
  } else {
    finalStatus = 'succeeded';
    await deps.updateExecution(executionId, {
      status: 'succeeded', completedAt: new Date(), progressPercent: 100,
      stateVersion: currentExecVersion + 1, updatedAt: new Date(),
    }, currentExecVersion);
    await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_execution_succeeded', detail_json: { nodesSucceeded } });
  }

  return {
    success: true,
    executionStatus: finalStatus,
    nodesSucceeded,
    nodesFailed,
    nodesCancelled,
    progress: finalStatus === 'succeeded' ? 100 : calculateProgress(nodeStatuses),
  };
}

/**
 * Cancel an execution.
 */
export async function cancelExecution(
  executionId: string,
  deps: DryRunDeps,
  actorId?: string
): Promise<{ success: boolean; error?: string; status: ExecutionStatus }> {
  const exec = await deps.getExecution(executionId);
  if (!exec) return { success: false, error: 'EXECUTION_NOT_FOUND', status: 'failed' };

  if (TERMINAL_EXECUTION_STATES.includes(exec.status)) {
    return { success: true, status: exec.status }; // idempotent
  }

  // If prepared → cancel directly
  if (exec.status === 'prepared') {
    await deps.updateExecution(executionId, {
      status: 'cancelled', cancelledAt: new Date(), cancelRequestedAt: new Date(),
      stateVersion: exec.stateVersion + 1, updatedAt: new Date(),
    }, exec.stateVersion);
    await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_execution_cancelled', detail_json: { cancelledFrom: 'prepared' } });
    return { success: true, status: 'cancelled' };
  }

  // If running → cancel_requested → cancel nodes → cancelled
  if (exec.status === 'running' || exec.status === 'cancel_requested') {
    await deps.updateExecution(executionId, {
      status: 'cancelled', cancelledAt: new Date(), cancelRequestedAt: exec.cancelRequestedAt || new Date(),
      stateVersion: exec.stateVersion + 1, updatedAt: new Date(),
    }, exec.stateVersion);

    // Cancel pending/ready nodes
    const nodes = await deps.getNodeExecutions(executionId);
    for (const node of nodes) {
      if (['pending', 'ready'].includes(node.status)) {
        await deps.updateNodeExecution(node.id, {
          status: 'cancelled', stateVersion: node.stateVersion + 1, updatedAt: new Date(),
        }, node.stateVersion);
      }
    }

    await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_execution_cancelled', detail_json: { cancelledFrom: exec.status } });
    return { success: true, status: 'cancelled' };
  }

  return { success: false, error: 'INVALID_STATE_FOR_CANCEL', status: exec.status };
}

/**
 * Retry a failed node (governed by runtime policy).
 */
export async function retryNode(
  executionId: string,
  nodeKey: string,
  maxAttempts: number,
  deps: DryRunDeps
): Promise<{ success: boolean; error?: string; attempt?: number }> {
  const nodes = await deps.getNodeExecutions(executionId);
  const node = nodes.find(n => n.nodeKey === nodeKey);
  if (!node) return { success: false, error: 'NODE_NOT_FOUND' };
  if (node.status !== 'failed') return { success: false, error: 'NODE_NOT_FAILED' };
  if (node.attempt >= maxAttempts) return { success: false, error: 'MAX_ATTEMPTS_EXHAUSTED' };

  // Reset to ready for retry
  await deps.updateNodeExecution(node.id, {
    status: 'ready', failedAt: null, failureCode: null, attempt: node.attempt + 1,
    stateVersion: node.stateVersion + 1, updatedAt: new Date(),
  }, node.stateVersion);

  await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_execution_retry_requested', node_key: nodeKey, detail_json: { attempt: node.attempt + 1 } });

  return { success: true, attempt: node.attempt + 1 };
}
