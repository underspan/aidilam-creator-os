/**
 * Shadow Executor Types & Handler Registry
 * AIDILAM-COM-04E3
 *
 * Fixed allowlisted handler registry. No eval, dynamic import, or shell commands from workflow JSON.
 */

export interface ShadowNodeContext {
  executionId: string;
  snapshotId: string;
  nodeKey: string;
  nodeType: string;
  workspaceId: string;
  projectId: string;
  workDir: string;
  attempt: number;
  effectiveConfig: Record<string, unknown>;
  providerPolicy: Record<string, unknown>;
  inputAssetVersionId: string | null;
  inputAssetChecksum: string | null;
  previousNodeOutputs: Map<string, ShadowNodeOutput>;
}

export interface ShadowNodeOutput {
  nodeKey: string;
  artifacts: ShadowArtifact[];
  metadata: Record<string, unknown>;
  success: boolean;
  error?: string;
}

export interface ShadowArtifact {
  artifactType: string;
  storageBinding: string;
  checksum?: string;
  sizeBytes?: number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface ShadowNodeHandler {
  nodeType: string;
  execute(ctx: ShadowNodeContext): Promise<ShadowNodeOutput>;
}

export interface ShadowProviderCall {
  executionId: string;
  nodeKey: string;
  capability: string;
  providerDefinitionId?: string;
  providerCode?: string;
  attempt: number;
  durationMs: number;
  result: string;
  detailJson?: Record<string, unknown>;
}

// === HANDLER REGISTRY (fixed allowlist, no dynamic loading) ===
const HANDLER_REGISTRY = new Map<string, ShadowNodeHandler>();

export function registerShadowHandler(handler: ShadowNodeHandler): void {
  HANDLER_REGISTRY.set(handler.nodeType, handler);
}

export function getShadowHandler(nodeType: string): ShadowNodeHandler | undefined {
  return HANDLER_REGISTRY.get(nodeType);
}

export function getRegisteredHandlerTypes(): string[] {
  return [...HANDLER_REGISTRY.keys()];
}

export interface ParityDimension {
  dimension: string;
  metric: string;
  legacyValue: string;
  shadowValue: string;
  result: 'pass' | 'fail' | 'inconclusive' | 'skip';
  tolerance?: string;
  detail?: Record<string, unknown>;
}
