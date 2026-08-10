/**
 * Canonical Workflow DAG Validator
 * AIDILAM-COM-04E1R2
 *
 * Single source of truth for all workflow specification validation.
 * All workflow version creation, clone, and import operations MUST route through this validator.
 */

// === TYPES ===

export interface WorkflowNode {
  node_key: string;
  node_type: string;
  display_name: string;
  position_index: number;
  config_json: Record<string, unknown>;
  capability?: string;
}

export interface WorkflowEdge {
  from_node_key: string;
  to_node_key: string;
  edge_type: string;
}

export interface WorkflowSpecification {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ValidationError {
  code: string;
  nodeKey?: string;
  edge?: { from: string; to: string };
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  metadata?: {
    nodeCount: number;
    edgeCount: number;
    cycleCount: number;
    unreachableExecutableNodes: number;
    publishingNodes: number;
  };
}

// === KNOWN NODE TYPES ===
const KNOWN_NODE_TYPES = new Set([
  'source',
  'process',
  'transform',
  'review',
  'output',
  'decision',
  'merge',
  'split',
  'wait',
  'notify',
  // Domain-specific pipeline node types (used in Video Localization Workflow)
  'analyze',
  'stt',
  'translate',
  'tts',
  'align',
  'render',
  'qc',
  'persist',
]);

// === KNOWN CAPABILITIES ===
const KNOWN_CAPABILITIES = new Set([
  'stt',
  'translation',
  'tts',
  'render',
  'subtitle_extraction',
  'audio_extraction',
  'video_download',
  'quality_check',
  'human_review',
  'storage',
  'metadata_extraction',
  'thumbnail_generation',
  null,
  undefined,
  '',
]);

// === DANGEROUS CONFIG PATTERNS ===
const DANGEROUS_PATTERNS = [
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
  /\bimport\s*\(/i,
  /\brequire\s*\(/i,
  /\bchild_process/i,
  /\bspawn\s*\(/i,
  /\bsh\s+-c\b/i,
  /\bbash\s+-c\b/i,
  /\/bin\/sh/i,
  /\/bin\/bash/i,
  /\bprocess\.env\b/i,
  /\bfs\.\w+Sync/i,
  /MINIO_SECRET/i,
  /MINIO_ACCESS/i,
  /AWS_SECRET/i,
  /POSTGRES_PASSWORD/i,
  /REDIS_PASSWORD/i,
  /SERVICE_TOKEN/i,
  /PRIVATE_KEY/i,
  /-----BEGIN.*KEY-----/i,
];

// === PUBLISHING NODE TYPES (detection only, not allowed in v1) ===
const PUBLISHING_CAPABILITIES = new Set([
  'youtube_upload',
  'tiktok_upload',
  'facebook_upload',
  'instagram_upload',
  'platform_publish',
]);

// === VALIDATOR ===

/**
 * Canonical workflow specification validator.
 * ALL workflow version creation, clone, and import MUST call this function.
 */
export function validateWorkflowVersion(spec: WorkflowSpecification): ValidationResult {
  const errors: ValidationError[] = [];

  // Rule 1: Workflow non-empty
  if (!spec.nodes || spec.nodes.length === 0) {
    errors.push({ code: 'WORKFLOW_EMPTY', message: 'Workflow must contain at least one node' });
    return { valid: false, errors, metadata: { nodeCount: 0, edgeCount: 0, cycleCount: 0, unreachableExecutableNodes: 0, publishingNodes: 0 } };
  }

  // Rule 2: Unique node keys
  const keySet = new Set<string>();
  for (const node of spec.nodes) {
    if (keySet.has(node.node_key)) {
      errors.push({ code: 'DUPLICATE_NODE_KEY', nodeKey: node.node_key, message: `Duplicate node key: ${node.node_key}` });
    }
    keySet.add(node.node_key);
  }

  // Rule 3: Known node types
  for (const node of spec.nodes) {
    if (!KNOWN_NODE_TYPES.has(node.node_type)) {
      errors.push({ code: 'UNKNOWN_NODE_TYPE', nodeKey: node.node_key, message: `Unknown node type: ${node.node_type}` });
    }
  }

  // Rule 4: Known capabilities
  for (const node of spec.nodes) {
    const cap = node.capability;
    if (cap && !KNOWN_CAPABILITIES.has(cap)) {
      errors.push({ code: 'UNKNOWN_CAPABILITY', nodeKey: node.node_key, message: `Unknown capability: ${cap}` });
    }
  }

  // Rule 5: Edges reference real nodes
  const edges = spec.edges || [];
  for (const edge of edges) {
    if (!keySet.has(edge.from_node_key)) {
      errors.push({ code: 'DANGLING_EDGE', edge: { from: edge.from_node_key, to: edge.to_node_key }, message: `Edge references non-existent source node: ${edge.from_node_key}` });
    }
    if (!keySet.has(edge.to_node_key)) {
      errors.push({ code: 'DANGLING_EDGE', edge: { from: edge.from_node_key, to: edge.to_node_key }, message: `Edge references non-existent target node: ${edge.to_node_key}` });
    }
  }

  // Rule 6: Graph acyclic (topological sort)
  const cycleCount = detectCycles(spec.nodes, edges);
  if (cycleCount > 0) {
    errors.push({ code: 'CYCLE_DETECTED', message: `Workflow graph contains ${cycleCount} cycle(s)` });
  }

  // Rule 7: Source node exists
  const sourceNodes = spec.nodes.filter(n => n.node_type === 'source');
  if (sourceNodes.length === 0) {
    errors.push({ code: 'SOURCE_REQUIRED', message: 'Workflow must have at least one source node' });
  }

  // Rule 8: Review terminal exists
  const reviewNodes = spec.nodes.filter(n => n.node_type === 'review');
  if (reviewNodes.length === 0) {
    errors.push({ code: 'TERMINAL_REVIEW_REQUIRED', message: 'Workflow must have at least one review terminal node' });
  }

  // Rule 9: All executable nodes reachable from source
  const unreachable = findUnreachableNodes(spec.nodes, edges);
  for (const nk of unreachable) {
    errors.push({ code: 'DISCONNECTED_NODE', nodeKey: nk, message: `Node ${nk} is not reachable from any source node` });
  }

  // Rule 10: Valid node configuration (no dangerous content)
  for (const node of spec.nodes) {
    const configStr = JSON.stringify(node.config_json || {});
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(configStr)) {
        errors.push({ code: 'INVALID_NODE_CONFIG', nodeKey: node.node_key, message: `Node config contains dangerous pattern` });
        break;
      }
    }
    // Also check display_name for injection
    if (node.display_name && DANGEROUS_PATTERNS.some(p => p.test(node.display_name))) {
      errors.push({ code: 'INVALID_NODE_CONFIG', nodeKey: node.node_key, message: `Node display_name contains dangerous pattern` });
    }
  }

  // Rule 11: Valid input/output contract shape (nodes must have required fields)
  for (const node of spec.nodes) {
    if (!node.node_key || typeof node.node_key !== 'string') {
      errors.push({ code: 'INVALID_NODE_CONFIG', nodeKey: node.node_key || '(empty)', message: 'Node must have a valid node_key string' });
    }
    if (!node.display_name || typeof node.display_name !== 'string') {
      errors.push({ code: 'INVALID_NODE_CONFIG', nodeKey: node.node_key, message: 'Node must have a valid display_name string' });
    }
    if (typeof node.position_index !== 'number' || node.position_index < 0) {
      errors.push({ code: 'INVALID_NODE_CONFIG', nodeKey: node.node_key, message: 'Node must have a valid position_index >= 0' });
    }
  }

  // Count publishing nodes
  const publishingNodes = spec.nodes.filter(n => n.capability && PUBLISHING_CAPABILITIES.has(n.capability)).length;

  const metadata = {
    nodeCount: spec.nodes.length,
    edgeCount: edges.length,
    cycleCount,
    unreachableExecutableNodes: unreachable.length,
    publishingNodes,
  };

  return { valid: errors.length === 0, errors, metadata };
}

// === CYCLE DETECTION (Kahn's algorithm) ===
function detectCycles(nodes: WorkflowNode[], edges: WorkflowEdge[]): number {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.node_key, 0);
    adjacency.set(node.node_key, []);
  }

  for (const edge of edges) {
    if (inDegree.has(edge.from_node_key) && inDegree.has(edge.to_node_key)) {
      adjacency.get(edge.from_node_key)!.push(edge.to_node_key);
      inDegree.set(edge.to_node_key, (inDegree.get(edge.to_node_key) || 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [key, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(key);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // Nodes not processed = part of cycle(s)
  return nodes.length - processed;
}

// === REACHABILITY (BFS from source nodes) ===
function findUnreachableNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const sourceKeys = nodes.filter(n => n.node_type === 'source').map(n => n.node_key);
  if (sourceKeys.length === 0) return nodes.map(n => n.node_key);

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.node_key, []);
  }
  for (const edge of edges) {
    if (adjacency.has(edge.from_node_key)) {
      adjacency.get(edge.from_node_key)!.push(edge.to_node_key);
    }
  }

  const visited = new Set<string>();
  const queue = [...sourceKeys];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of adjacency.get(current) || []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  // Return node_keys not reachable from source, excluding source nodes themselves
  return nodes
    .filter(n => !visited.has(n.node_key) && n.node_type !== 'source')
    .map(n => n.node_key);
}
