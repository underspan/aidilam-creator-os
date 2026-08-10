/**
 * Deterministic State Machine Service
 * AIDILAM-COM-04E2
 *
 * All execution/node status transitions MUST route through these functions.
 * No ad-hoc UPDATE status = ... from other modules.
 */
import {
  ExecutionStatus, NodeStatus,
  EXECUTION_TRANSITIONS, NODE_TRANSITIONS,
  TERMINAL_EXECUTION_STATES, TERMINAL_NODE_STATES,
} from './types.js';

export interface TransitionResult {
  success: boolean;
  error?: string;
  previousStatus?: string;
  newStatus?: string;
}

/**
 * Validate and apply execution status transition.
 * Returns success/error. Caller must persist atomically.
 */
export function transitionWorkflowExecution(
  currentStatus: ExecutionStatus,
  targetStatus: ExecutionStatus,
  currentStateVersion: number,
  expectedStateVersion: number
): TransitionResult {
  // Optimistic concurrency check
  if (currentStateVersion !== expectedStateVersion) {
    return { success: false, error: 'STATE_VERSION_MISMATCH', previousStatus: currentStatus };
  }

  // Terminal idempotency: if already at target, succeed silently
  if (currentStatus === targetStatus) {
    return { success: true, previousStatus: currentStatus, newStatus: targetStatus };
  }

  // Check if already terminal
  if (TERMINAL_EXECUTION_STATES.includes(currentStatus)) {
    return { success: false, error: 'EXECUTION_TERMINAL', previousStatus: currentStatus };
  }

  // Validate transition
  const allowed = EXECUTION_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    return { success: false, error: 'INVALID_EXECUTION_TRANSITION', previousStatus: currentStatus, newStatus: targetStatus };
  }

  return { success: true, previousStatus: currentStatus, newStatus: targetStatus };
}

/**
 * Validate and apply node execution status transition.
 */
export function transitionNodeExecution(
  currentStatus: NodeStatus,
  targetStatus: NodeStatus,
  currentStateVersion: number,
  expectedStateVersion: number
): TransitionResult {
  // Optimistic concurrency check
  if (currentStateVersion !== expectedStateVersion) {
    return { success: false, error: 'STATE_VERSION_MISMATCH', previousStatus: currentStatus };
  }

  // Terminal idempotency
  if (currentStatus === targetStatus) {
    return { success: true, previousStatus: currentStatus, newStatus: targetStatus };
  }

  // Check if already terminal (except failed→ready for retry)
  if (TERMINAL_NODE_STATES.includes(currentStatus) && !(currentStatus === 'failed' && targetStatus === 'ready')) {
    return { success: false, error: 'NODE_TERMINAL', previousStatus: currentStatus };
  }

  // Validate transition
  const allowed = NODE_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    return { success: false, error: 'INVALID_NODE_TRANSITION', previousStatus: currentStatus, newStatus: targetStatus };
  }

  return { success: true, previousStatus: currentStatus, newStatus: targetStatus };
}

/**
 * Check if a node is ready based on predecessors.
 * DAG-driven: node becomes ready when ALL predecessor nodes are succeeded.
 */
export function isNodeReady(
  nodeKey: string,
  edges: Array<{ from_node_key: string; to_node_key: string }>,
  nodeStatuses: Map<string, NodeStatus>
): boolean {
  const predecessors = edges
    .filter(e => e.to_node_key === nodeKey)
    .map(e => e.from_node_key);

  // Source nodes (no predecessors) are immediately ready
  if (predecessors.length === 0) return true;

  // All predecessors must be succeeded
  return predecessors.every(pk => nodeStatuses.get(pk) === 'succeeded');
}

/**
 * Calculate execution progress from node states.
 * Equal weight per node. Progress = succeeded_nodes / total_nodes * 100.
 */
export function calculateProgress(nodeStatuses: Map<string, NodeStatus>): number {
  if (nodeStatuses.size === 0) return 0;
  let completed = 0;
  for (const status of nodeStatuses.values()) {
    if (status === 'succeeded') completed++;
  }
  return Math.round((completed / nodeStatuses.size) * 100);
}
