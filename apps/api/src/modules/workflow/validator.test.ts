/**
 * Dedicated Workflow Domain Test Suite
 * AIDILAM-COM-04E1R2
 *
 * Part 1: Canonical Validator Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { validateWorkflowVersion, WorkflowSpecification } from './validator.js';

// === VALID WORKFLOW FIXTURES ===
const VALID_MINIMAL_WORKFLOW: WorkflowSpecification = {
  nodes: [
    { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
    { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {} },
  ],
  edges: [{ from_node_key: 'src', to_node_key: 'rev', edge_type: 'sequence' }],
};

const VIDEO_LOCALIZATION_WORKFLOW: WorkflowSpecification = {
  nodes: [
    { node_key: 'ingest', node_type: 'source', display_name: 'Video Ingest', position_index: 0, config_json: { acceptedFormats: ['mp4','mkv','avi'] }, capability: 'video_download' },
    { node_key: 'extract_audio', node_type: 'process', display_name: 'Audio Extraction', position_index: 1, config_json: { outputFormat: 'wav', sampleRate: 16000 }, capability: 'audio_extraction' },
    { node_key: 'extract_subs', node_type: 'process', display_name: 'Subtitle Extraction', position_index: 2, config_json: { formats: ['srt','ass'] }, capability: 'subtitle_extraction' },
    { node_key: 'stt', node_type: 'process', display_name: 'Speech-to-Text', position_index: 3, config_json: { language: 'zh', model: 'base' }, capability: 'stt' },
    { node_key: 'translate', node_type: 'transform', display_name: 'Translation', position_index: 4, config_json: { sourceLang: 'zh', targetLang: 'vi' }, capability: 'translation' },
    { node_key: 'tts', node_type: 'process', display_name: 'Text-to-Speech', position_index: 5, config_json: { voice: 'vi-VN-HoaiMyNeural', rate: '+0%' }, capability: 'tts' },
    { node_key: 'render', node_type: 'process', display_name: 'Video Render', position_index: 6, config_json: { codec: 'libx264', preset: 'medium' }, capability: 'render' },
    { node_key: 'qc', node_type: 'process', display_name: 'Quality Check', position_index: 7, config_json: { minBitrate: 1000 }, capability: 'quality_check' },
    { node_key: 'store', node_type: 'output', display_name: 'Storage', position_index: 8, config_json: { bucket: 'outputs' }, capability: 'storage' },
    { node_key: 'review', node_type: 'review', display_name: 'Human Review', position_index: 9, config_json: {}, capability: 'human_review' },
  ],
  edges: [
    { from_node_key: 'ingest', to_node_key: 'extract_audio', edge_type: 'sequence' },
    { from_node_key: 'ingest', to_node_key: 'extract_subs', edge_type: 'sequence' },
    { from_node_key: 'extract_audio', to_node_key: 'stt', edge_type: 'sequence' },
    { from_node_key: 'extract_subs', to_node_key: 'translate', edge_type: 'sequence' },
    { from_node_key: 'stt', to_node_key: 'translate', edge_type: 'sequence' },
    { from_node_key: 'translate', to_node_key: 'tts', edge_type: 'sequence' },
    { from_node_key: 'tts', to_node_key: 'render', edge_type: 'sequence' },
    { from_node_key: 'render', to_node_key: 'qc', edge_type: 'sequence' },
    { from_node_key: 'qc', to_node_key: 'store', edge_type: 'sequence' },
    { from_node_key: 'store', to_node_key: 'review', edge_type: 'sequence' },
  ],
};

describe('Canonical Workflow Validator - Valid Workflows', () => {
  it('01: validates minimal valid workflow (source + review)', () => {
    const result = validateWorkflowVersion(VALID_MINIMAL_WORKFLOW);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.metadata!.nodeCount).toBe(2);
    expect(result.metadata!.edgeCount).toBe(1);
    expect(result.metadata!.cycleCount).toBe(0);
  });

  it('02: validates Video Localization Workflow v1 (10 nodes, 10 edges)', () => {
    const result = validateWorkflowVersion(VIDEO_LOCALIZATION_WORKFLOW);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.metadata!.nodeCount).toBe(10);
    expect(result.metadata!.edgeCount).toBe(10);
    expect(result.metadata!.cycleCount).toBe(0);
    expect(result.metadata!.unreachableExecutableNodes).toBe(0);
    expect(result.metadata!.publishingNodes).toBe(0);
  });

  it('03: returns structured metadata for valid workflow', () => {
    const result = validateWorkflowVersion(VALID_MINIMAL_WORKFLOW);
    expect(result.metadata).toBeDefined();
    expect(typeof result.metadata!.nodeCount).toBe('number');
    expect(typeof result.metadata!.edgeCount).toBe('number');
    expect(typeof result.metadata!.cycleCount).toBe('number');
    expect(typeof result.metadata!.unreachableExecutableNodes).toBe('number');
    expect(typeof result.metadata!.publishingNodes).toBe('number');
  });
});

describe('Canonical Workflow Validator - Empty Workflow', () => {
  it('04: rejects empty nodes array', () => {
    const result = validateWorkflowVersion({ nodes: [], edges: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'WORKFLOW_EMPTY')).toBe(true);
  });

  it('05: rejects undefined nodes', () => {
    const result = validateWorkflowVersion({ nodes: undefined as any, edges: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'WORKFLOW_EMPTY')).toBe(true);
  });
});

describe('Canonical Workflow Validator - Duplicate Node Keys', () => {
  it('06: rejects duplicate node keys', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'src', node_type: 'review', display_name: 'Dup', position_index: 1, config_json: {} },
      ],
      edges: [],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'DUPLICATE_NODE_KEY')).toBe(true);
  });

  it('07: reports which key is duplicated', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'dup_key', node_type: 'source', display_name: 'A', position_index: 0, config_json: {} },
        { node_key: 'dup_key', node_type: 'review', display_name: 'B', position_index: 1, config_json: {} },
      ],
      edges: [],
    };
    const result = validateWorkflowVersion(spec);
    const err = result.errors.find(e => e.code === 'DUPLICATE_NODE_KEY');
    expect(err).toBeDefined();
    expect(err!.nodeKey).toBe('dup_key');
  });
});

describe('Canonical Workflow Validator - Unknown Node Types', () => {
  it('08: rejects unknown node type', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'bad', node_type: 'quantum_teleporter', display_name: 'Bad', position_index: 1, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 2, config_json: {} },
      ],
      edges: [
        { from_node_key: 'src', to_node_key: 'bad', edge_type: 'sequence' },
        { from_node_key: 'bad', to_node_key: 'rev', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'UNKNOWN_NODE_TYPE' && e.nodeKey === 'bad')).toBe(true);
  });
});

describe('Canonical Workflow Validator - Unknown Capabilities', () => {
  it('09: rejects unknown capability', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {}, capability: 'video_download' },
        { node_key: 'proc', node_type: 'process', display_name: 'Proc', position_index: 1, config_json: {}, capability: 'time_travel' },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 2, config_json: {} },
      ],
      edges: [
        { from_node_key: 'src', to_node_key: 'proc', edge_type: 'sequence' },
        { from_node_key: 'proc', to_node_key: 'rev', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'UNKNOWN_CAPABILITY' && e.nodeKey === 'proc')).toBe(true);
  });

  it('10: allows null/empty capability', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {}, capability: '' },
      ],
      edges: [{ from_node_key: 'src', to_node_key: 'rev', edge_type: 'sequence' }],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(true);
  });
});

describe('Canonical Workflow Validator - Dangling Edges', () => {
  it('11: rejects edge with non-existent source node', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {} },
      ],
      edges: [
        { from_node_key: 'ghost', to_node_key: 'rev', edge_type: 'sequence' },
        { from_node_key: 'src', to_node_key: 'rev', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'DANGLING_EDGE')).toBe(true);
  });

  it('12: rejects edge with non-existent target node', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {} },
      ],
      edges: [
        { from_node_key: 'src', to_node_key: 'nowhere', edge_type: 'sequence' },
        { from_node_key: 'src', to_node_key: 'rev', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'DANGLING_EDGE' && e.edge?.to === 'nowhere')).toBe(true);
  });
});

describe('Canonical Workflow Validator - Cycle Detection', () => {
  it('13: rejects direct cycle (A→B→A)', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'a', node_type: 'process', display_name: 'A', position_index: 1, config_json: {} },
        { node_key: 'b', node_type: 'process', display_name: 'B', position_index: 2, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 3, config_json: {} },
      ],
      edges: [
        { from_node_key: 'src', to_node_key: 'a', edge_type: 'sequence' },
        { from_node_key: 'a', to_node_key: 'b', edge_type: 'sequence' },
        { from_node_key: 'b', to_node_key: 'a', edge_type: 'sequence' },
        { from_node_key: 'b', to_node_key: 'rev', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CYCLE_DETECTED')).toBe(true);
    expect(result.metadata!.cycleCount).toBeGreaterThan(0);
  });

  it('14: rejects indirect cycle (A→B→C→A)', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'a', node_type: 'process', display_name: 'A', position_index: 1, config_json: {} },
        { node_key: 'b', node_type: 'process', display_name: 'B', position_index: 2, config_json: {} },
        { node_key: 'c', node_type: 'process', display_name: 'C', position_index: 3, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 4, config_json: {} },
      ],
      edges: [
        { from_node_key: 'src', to_node_key: 'a', edge_type: 'sequence' },
        { from_node_key: 'a', to_node_key: 'b', edge_type: 'sequence' },
        { from_node_key: 'b', to_node_key: 'c', edge_type: 'sequence' },
        { from_node_key: 'c', to_node_key: 'a', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CYCLE_DETECTED')).toBe(true);
  });
});

describe('Canonical Workflow Validator - Disconnected Nodes', () => {
  it('15: rejects node unreachable from source', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'connected', node_type: 'process', display_name: 'Connected', position_index: 1, config_json: {} },
        { node_key: 'island', node_type: 'process', display_name: 'Island', position_index: 2, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 3, config_json: {} },
      ],
      edges: [
        { from_node_key: 'src', to_node_key: 'connected', edge_type: 'sequence' },
        { from_node_key: 'connected', to_node_key: 'rev', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'DISCONNECTED_NODE' && e.nodeKey === 'island')).toBe(true);
  });
});

describe('Canonical Workflow Validator - Missing Source', () => {
  it('16: rejects workflow with no source node', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'proc', node_type: 'process', display_name: 'Proc', position_index: 0, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {} },
      ],
      edges: [{ from_node_key: 'proc', to_node_key: 'rev', edge_type: 'sequence' }],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'SOURCE_REQUIRED')).toBe(true);
  });
});

describe('Canonical Workflow Validator - Missing Review Terminal', () => {
  it('17: rejects workflow with no review node', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'proc', node_type: 'process', display_name: 'Proc', position_index: 1, config_json: {} },
      ],
      edges: [{ from_node_key: 'src', to_node_key: 'proc', edge_type: 'sequence' }],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TERMINAL_REVIEW_REQUIRED')).toBe(true);
  });
});

export { VALID_MINIMAL_WORKFLOW, VIDEO_LOCALIZATION_WORKFLOW };
