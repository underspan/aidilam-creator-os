/**
 * Shadow DAG Executor
 * AIDILAM-COM-04E3
 *
 * Executes real shadow workflow through DAG topology using immutable snapshot.
 * Calls real providers through governed adapter registry.
 * Does NOT use mutable WorkflowDefinition.current_version.
 */
import { getShadowHandler, ShadowNodeContext, ShadowNodeOutput, ShadowArtifact, ShadowProviderCall } from './shadow-types.js';
import { isNodeReady, calculateProgress } from './state-machine.js';
import { NodeStatus, ExecutionStatus, TERMINAL_EXECUTION_STATES } from './types.js';

export interface ShadowExecutorDeps {
  getExecution(executionId: string): Promise<any>;
  getSnapshot(snapshotId: string): Promise<any>;
  getNodeExecutions(executionId: string): Promise<any[]>;
  updateExecution(id: string, fields: any, expectedVersion: number): Promise<boolean>;
  updateNodeExecution(id: string, fields: any, expectedVersion: number): Promise<boolean>;
  persistShadowArtifact(artifact: any): Promise<void>;
  persistProviderCall(call: ShadowProviderCall): Promise<void>;
  persistAudit(event: any): Promise<void>;
  createWorkDir(executionId: string): string;
  cleanupWorkDir(workDir: string): void;
}

export interface ShadowExecutionResult {
  success: boolean;
  error?: string;
  executionId: string;
  executionStatus: ExecutionStatus;
  nodesSucceeded: number;
  nodesFailed: number;
  progress: number;
  artifacts: ShadowArtifact[];
  providerCalls: ShadowProviderCall[];
}

/**
 * Execute a shadow workflow using real providers.
 * Traverses DAG generically - no hardcoded pipeline sequence.
 */
export async function executeShadowWorkflow(
  executionId: string,
  deps: ShadowExecutorDeps
): Promise<ShadowExecutionResult> {
  const exec = await deps.getExecution(executionId);
  if (!exec) return { success: false, error: 'EXECUTION_NOT_FOUND', executionId, executionStatus: 'failed', nodesSucceeded: 0, nodesFailed: 0, progress: 0, artifacts: [], providerCalls: [] };

  if (exec.execution_mode !== 'shadow') return { success: false, error: 'NOT_SHADOW_MODE', executionId, executionStatus: exec.status, nodesSucceeded: 0, nodesFailed: 0, progress: 0, artifacts: [], providerCalls: [] };

  if (TERMINAL_EXECUTION_STATES.includes(exec.status as ExecutionStatus)) {
    return { success: false, error: 'EXECUTION_ALREADY_TERMINAL', executionId, executionStatus: exec.status, nodesSucceeded: 0, nodesFailed: 0, progress: exec.progress_percent, artifacts: [], providerCalls: [] };
  }

  // Load immutable snapshot (NOT current mutable workflow definition)
  const snapshot = await deps.getSnapshot(exec.snapshot_id);
  if (!snapshot) return { success: false, error: 'SNAPSHOT_NOT_FOUND', executionId, executionStatus: 'failed', nodesSucceeded: 0, nodesFailed: 0, progress: 0, artifacts: [], providerCalls: [] };

  const snapshotJson = snapshot.snapshot_json;
  const frozenNodes: Array<{ nodeKey: string; nodeType: string; ordinal: number }> = snapshotJson.nodes || [];
  const frozenEdges: Array<{ from: string; to: string }> = snapshotJson.edges || [];
  const edgesArr = frozenEdges.map(e => ({ from_node_key: e.from, to_node_key: e.to }));

  // Start execution
  let execVersion = exec.state_version;
  await deps.updateExecution(executionId, { status: 'running', started_at: new Date(), state_version: execVersion + 1, updated_at: new Date() }, execVersion);
  execVersion++;
  await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_shadow_started', detail_json: { nodeCount: frozenNodes.length } });

  const workDir = deps.createWorkDir(executionId);
  const allArtifacts: ShadowArtifact[] = [];
  const allProviderCalls: ShadowProviderCall[] = [];
  const nodeOutputs = new Map<string, ShadowNodeOutput>();

  // Load node execution records
  const nodeExecs = await deps.getNodeExecutions(executionId);
  const nodeMap = new Map<string, any>();
  const nodeStatuses = new Map<string, NodeStatus>();
  for (const ne of nodeExecs) {
    nodeMap.set(ne.node_key, ne);
    nodeStatuses.set(ne.node_key, ne.status as NodeStatus);
  }

  let nodesSucceeded = 0;
  let nodesFailed = 0;
  let executionFailed = false;
  const sortedNodes = [...frozenNodes].sort((a, b) => a.ordinal - b.ordinal);

  // DAG-driven execution loop
  const maxIterations = sortedNodes.length * 4;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    let advanced = false;

    for (const frozenNode of sortedNodes) {
      const currentStatus = nodeStatuses.get(frozenNode.nodeKey);
      if (!currentStatus) continue;

      // Skip terminal/non-actionable
      if (['succeeded', 'failed', 'skipped', 'cancelled'].includes(currentStatus)) continue;
      if (executionFailed && currentStatus !== 'running') continue;

      const ne = nodeMap.get(frozenNode.nodeKey);
      if (!ne) continue;

      // pending → ready if predecessors satisfied (DAG-driven, not hardcoded sequence)
      if (currentStatus === 'pending') {
        if (isNodeReady(frozenNode.nodeKey, edgesArr, nodeStatuses)) {
          await deps.updateNodeExecution(ne.id, { status: 'ready', state_version: ne.state_version + 1, updated_at: new Date() }, ne.state_version);
          ne.state_version++;
          nodeStatuses.set(frozenNode.nodeKey, 'ready');
          advanced = true;
        }
        continue;
      }

      // ready → running → execute handler
      if (currentStatus === 'ready') {
        await deps.updateNodeExecution(ne.id, { status: 'running', started_at: new Date(), state_version: ne.state_version + 1, updated_at: new Date() }, ne.state_version);
        ne.state_version++;
        nodeStatuses.set(frozenNode.nodeKey, 'running');
        await deps.updateExecution(executionId, { current_node_key: frozenNode.nodeKey, state_version: execVersion + 1, updated_at: new Date() }, execVersion);
        execVersion++;
        await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_shadow_node_started', node_key: frozenNode.nodeKey, detail_json: { attempt: ne.attempt } });

        // Execute real handler
        const handler = getShadowHandler(frozenNode.nodeType);
        if (!handler) {
          // No handler = skip node
          await deps.updateNodeExecution(ne.id, { status: 'skipped', state_version: ne.state_version + 1, updated_at: new Date() }, ne.state_version);
          ne.state_version++;
          nodeStatuses.set(frozenNode.nodeKey, 'skipped');
          advanced = true;
          continue;
        }

        const ctx: ShadowNodeContext = {
          executionId,
          snapshotId: exec.snapshot_id,
          nodeKey: frozenNode.nodeKey,
          nodeType: frozenNode.nodeType,
          workspaceId: snapshot.workspace_id,
          projectId: snapshot.project_id,
          workDir,
          attempt: ne.attempt,
          effectiveConfig: snapshot.effective_config_json || {},
          providerPolicy: snapshot.provider_policy_json || {},
          inputAssetVersionId: snapshot.input_asset_version_id,
          inputAssetChecksum: snapshot.input_asset_checksum,
          previousNodeOutputs: nodeOutputs,
        };

        try {
          const output = await handler.execute(ctx);
          nodeOutputs.set(frozenNode.nodeKey, output);

          if (output.success) {
            // Persist artifacts
            for (const art of output.artifacts) {
              await deps.persistShadowArtifact({
                workspace_id: snapshot.workspace_id,
                project_id: snapshot.project_id,
                execution_id: executionId,
                node_execution_id: ne.id,
                node_key: frozenNode.nodeKey,
                artifact_type: art.artifactType,
                storage_binding: art.storageBinding,
                checksum_sha256: art.checksum || null,
                size_bytes: art.sizeBytes || null,
                mime_type: art.mimeType || null,
                metadata_json: art.metadata || {},
              });
              allArtifacts.push(art);
            }

            await deps.updateNodeExecution(ne.id, {
              status: 'succeeded', completed_at: new Date(), progress_percent: 100,
              output_reference_json: { artifactCount: output.artifacts.length, ...output.metadata },
              state_version: ne.state_version + 1, updated_at: new Date(),
            }, ne.state_version);
            ne.state_version++;
            nodeStatuses.set(frozenNode.nodeKey, 'succeeded');
            nodesSucceeded++;
            await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_shadow_node_succeeded', node_key: frozenNode.nodeKey, detail_json: output.metadata });
          } else {
            await deps.updateNodeExecution(ne.id, {
              status: 'failed', failed_at: new Date(), failure_code: output.error || 'HANDLER_FAILED',
              state_version: ne.state_version + 1, updated_at: new Date(),
            }, ne.state_version);
            ne.state_version++;
            nodeStatuses.set(frozenNode.nodeKey, 'failed');
            nodesFailed++;
            executionFailed = true;
            await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_shadow_node_failed', node_key: frozenNode.nodeKey, detail_json: { error: output.error } });
          }
        } catch (err: any) {
          await deps.updateNodeExecution(ne.id, {
            status: 'failed', failed_at: new Date(), failure_code: 'HANDLER_EXCEPTION',
            state_version: ne.state_version + 1, updated_at: new Date(),
          }, ne.state_version);
          ne.state_version++;
          nodeStatuses.set(frozenNode.nodeKey, 'failed');
          nodesFailed++;
          executionFailed = true;
          await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_shadow_node_failed', node_key: frozenNode.nodeKey, detail_json: { error: err.message } });
        }

        // Update progress
        const progress = calculateProgress(nodeStatuses);
        await deps.updateExecution(executionId, { progress_percent: progress, state_version: execVersion + 1, updated_at: new Date() }, execVersion);
        execVersion++;
        advanced = true;
        continue;
      }
    }

    if (!advanced) break;
  }

  // Final status
  const finalProgress = calculateProgress(nodeStatuses);
  let finalStatus: ExecutionStatus;
  if (executionFailed) {
    finalStatus = 'failed';
    await deps.updateExecution(executionId, { status: 'failed', failed_at: new Date(), failure_code: 'NODE_FAILED', progress_percent: finalProgress, state_version: execVersion + 1, updated_at: new Date() }, execVersion);
    await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_shadow_failed', detail_json: { nodesSucceeded, nodesFailed } });
  } else {
    finalStatus = 'succeeded';
    await deps.updateExecution(executionId, { status: 'succeeded', completed_at: new Date(), progress_percent: 100, state_version: execVersion + 1, updated_at: new Date() }, execVersion);
    await deps.persistAudit({ execution_id: executionId, event_type: 'workflow_shadow_succeeded', detail_json: { nodesSucceeded, artifacts: allArtifacts.length } });
  }

  // Cleanup work dir
  try { deps.cleanupWorkDir(workDir); } catch { /* best effort */ }

  return {
    success: !executionFailed,
    executionId,
    executionStatus: finalStatus,
    nodesSucceeded,
    nodesFailed,
    progress: finalStatus === 'succeeded' ? 100 : finalProgress,
    artifacts: allArtifacts,
    providerCalls: allProviderCalls,
  };
}
