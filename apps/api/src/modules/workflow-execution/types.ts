/**
 * Workflow Execution Domain Types
 * AIDILAM-COM-04E2
 */

// === EXECUTION SNAPSHOT ===
export interface ExecutionSnapshotInput {
  workspaceId: string;
  projectId: string;
  workflowDefinitionId: string;
  workflowVersionId: string;
  templateId?: string;
  templateVersionId?: string;
  inputAssetId?: string;
  inputAssetVersionId?: string;
  effectiveConfig: Record<string, unknown>;
  actorId: string;
  idempotencyKey?: string;
}

export interface ExecutionSnapshot {
  id: string;
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
  effectiveConfigJson: Record<string, unknown>;
  effectiveConfigChecksum: string;
  providerPolicyJson: Record<string, unknown>;
  providerPolicyChecksum: string;
  runtimePolicyJson: Record<string, unknown>;
  snapshotJson: Record<string, unknown>;
  snapshotChecksumSha256: string;
  schemaVersion: string;
  createdBy: string;
  createdAt: Date;
  idempotencyKey: string | null;
}

// === EXECUTION ===
export type ExecutionMode = 'dry_run';
export type ExecutionStatus = 'prepared' | 'running' | 'cancel_requested' | 'succeeded' | 'failed' | 'cancelled';
export type NodeStatus = 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';

export interface WorkflowExecution {
  id: string;
  snapshotId: string;
  workspaceId: string;
  projectId: string;
  executionMode: ExecutionMode;
  status: ExecutionStatus;
  currentNodeKey: string | null;
  progressPercent: number;
  attempt: number;
  stateVersion: number;
  cancelRequestedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NodeExecution {
  id: string;
  executionId: string;
  nodeKey: string;
  nodeType: string;
  ordinal: number;
  status: NodeStatus;
  attempt: number;
  stateVersion: number;
  progressPercent: number;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
  inputReferenceJson: Record<string, unknown> | null;
  outputReferenceJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// === TRANSITION DEFINITIONS ===
export const EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  prepared: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancel_requested'],
  cancel_requested: ['cancelled', 'failed', 'succeeded'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export const NODE_TRANSITIONS: Record<NodeStatus, NodeStatus[]> = {
  pending: ['ready', 'cancelled', 'skipped'],
  ready: ['running', 'cancelled', 'skipped'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: ['ready'], // retry path
  skipped: [],
  cancelled: [],
};

export const TERMINAL_EXECUTION_STATES: ExecutionStatus[] = ['succeeded', 'failed', 'cancelled'];
export const TERMINAL_NODE_STATES: NodeStatus[] = ['succeeded', 'failed', 'skipped', 'cancelled'];
