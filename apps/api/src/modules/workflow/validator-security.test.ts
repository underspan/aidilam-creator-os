/**
 * Dedicated Workflow Domain Test Suite
 * AIDILAM-COM-04E1R2
 *
 * Part 2: Dangerous Config, Security, Error Contract
 */
import { describe, it, expect } from 'vitest';
import { validateWorkflowVersion, WorkflowSpecification, ValidationResult } from './validator.js';

describe('Canonical Workflow Validator - Dangerous Config Rejection', () => {
  const makeSpec = (configJson: Record<string, unknown>): WorkflowSpecification => ({
    nodes: [
      { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
      { node_key: 'bad', node_type: 'process', display_name: 'Bad', position_index: 1, config_json: configJson },
      { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 2, config_json: {} },
    ],
    edges: [
      { from_node_key: 'src', to_node_key: 'bad', edge_type: 'sequence' },
      { from_node_key: 'bad', to_node_key: 'rev', edge_type: 'sequence' },
    ],
  });

  it('18: rejects shell command in config', () => {
    const result = validateWorkflowVersion(makeSpec({ cmd: 'sh -c "rm -rf /"' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('19: rejects eval in config', () => {
    const result = validateWorkflowVersion(makeSpec({ script: 'eval("process.exit(1)")' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('20: rejects dynamic import in config', () => {
    const result = validateWorkflowVersion(makeSpec({ load: "import('child_process')" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('21: rejects require in config', () => {
    const result = validateWorkflowVersion(makeSpec({ x: "require('fs').unlinkSync('/etc/passwd')" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('22: rejects child_process reference in config', () => {
    const result = validateWorkflowVersion(makeSpec({ exec: 'child_process.execSync("whoami")' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('23: rejects /bin/bash path in config', () => {
    const result = validateWorkflowVersion(makeSpec({ shell: '/bin/bash -c "cat /etc/shadow"' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('24: rejects MINIO_SECRET in config', () => {
    const result = validateWorkflowVersion(makeSpec({ key: 'MINIO_SECRET_KEY=abc123' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('25: rejects POSTGRES_PASSWORD in config', () => {
    const result = validateWorkflowVersion(makeSpec({ dsn: 'POSTGRES_PASSWORD=hunter2' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('26: rejects private key in config', () => {
    const result = validateWorkflowVersion(makeSpec({ pk: '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAA...' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('27: rejects spawn() call in config', () => {
    const result = validateWorkflowVersion(makeSpec({ run: "spawn('/usr/bin/python3', ['-c', 'import os'])" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('28: rejects SERVICE_TOKEN in config', () => {
    const result = validateWorkflowVersion(makeSpec({ tok: 'SERVICE_TOKEN=eyJhbGc...' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('29: allows safe config with normal values', () => {
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: { format: 'mp4', maxSize: 500 } },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: { autoApprove: false } },
      ],
      edges: [{ from_node_key: 'src', to_node_key: 'rev', edge_type: 'sequence' }],
    });
    expect(result.valid).toBe(true);
  });
});

describe('Canonical Workflow Validator - Error Contract Structure', () => {
  it('30: error objects have code and message', () => {
    const result = validateWorkflowVersion({ nodes: [], edges: [] });
    expect(result.valid).toBe(false);
    for (const err of result.errors) {
      expect(err.code).toBeDefined();
      expect(typeof err.code).toBe('string');
      expect(err.message).toBeDefined();
      expect(typeof err.message).toBe('string');
    }
  });

  it('31: no stack traces in error messages', () => {
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'bad', node_type: 'alien', display_name: 'X', position_index: 1, config_json: {} },
      ],
      edges: [],
    });
    for (const err of result.errors) {
      expect(err.message).not.toMatch(/at \w+\.\w+/);
      expect(err.message).not.toMatch(/node_modules/);
      expect(err.message).not.toContain('Error:');
    }
  });

  it('32: error codes are stable string constants', () => {
    const VALID_CODES = [
      'WORKFLOW_EMPTY', 'DUPLICATE_NODE_KEY', 'UNKNOWN_NODE_TYPE',
      'UNKNOWN_CAPABILITY', 'DANGLING_EDGE', 'CYCLE_DETECTED',
      'DISCONNECTED_NODE', 'SOURCE_REQUIRED', 'TERMINAL_REVIEW_REQUIRED',
      'INVALID_NODE_CONFIG',
    ];
    // Trigger multiple errors
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: 'x', node_type: 'alien', display_name: 'X', position_index: 0, config_json: {} },
      ],
      edges: [{ from_node_key: 'x', to_node_key: 'y', edge_type: 'seq' }],
    });
    for (const err of result.errors) {
      expect(VALID_CODES).toContain(err.code);
    }
  });

  it('33: dangling edge error includes edge info', () => {
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'A', position_index: 0, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'B', position_index: 1, config_json: {} },
      ],
      edges: [{ from_node_key: 'ghost', to_node_key: 'rev', edge_type: 'seq' }],
    });
    const dangle = result.errors.find(e => e.code === 'DANGLING_EDGE');
    expect(dangle).toBeDefined();
    expect(dangle!.edge).toBeDefined();
    expect(dangle!.edge!.from).toBe('ghost');
  });

  it('34: multiple errors accumulated (not short-circuit after first)', () => {
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: 'dup', node_type: 'alien', display_name: 'A', position_index: 0, config_json: {} },
        { node_key: 'dup', node_type: 'review', display_name: 'B', position_index: 1, config_json: {} },
      ],
      edges: [{ from_node_key: 'x', to_node_key: 'y', edge_type: 'seq' }],
    });
    // Should have multiple different error codes
    const codes = new Set(result.errors.map(e => e.code));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('Canonical Workflow Validator - Node Config Shape', () => {
  it('35: rejects node without node_key', () => {
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: '', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {} },
      ],
      edges: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('36: rejects node without display_name', () => {
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: '', position_index: 0, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {} },
      ],
      edges: [{ from_node_key: 'src', to_node_key: 'rev', edge_type: 'sequence' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('37: rejects negative position_index', () => {
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: -1, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {} },
      ],
      edges: [{ from_node_key: 'src', to_node_key: 'rev', edge_type: 'sequence' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });

  it('38: rejects dangerous display_name', () => {
    const result = validateWorkflowVersion({
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: "eval('bad')", position_index: 0, config_json: {} },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 1, config_json: {} },
      ],
      edges: [{ from_node_key: 'src', to_node_key: 'rev', edge_type: 'sequence' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NODE_CONFIG')).toBe(true);
  });
});

describe('Canonical Workflow Validator - Publishing Detection', () => {
  it('39: detects publishing capability nodes (reported in metadata even if unknown)', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'Input', position_index: 0, config_json: {} },
        { node_key: 'pub', node_type: 'output', display_name: 'YouTube', position_index: 1, config_json: {}, capability: 'youtube_upload' },
        { node_key: 'rev', node_type: 'review', display_name: 'Review', position_index: 2, config_json: {} },
      ],
      edges: [
        { from_node_key: 'src', to_node_key: 'pub', edge_type: 'sequence' },
        { from_node_key: 'pub', to_node_key: 'rev', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    // youtube_upload is NOT a known capability → UNKNOWN_CAPABILITY error
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'UNKNOWN_CAPABILITY')).toBe(true);
    // Publishing detection still runs and reports in metadata
    // youtube_upload IS in PUBLISHING_CAPABILITIES set, so it's correctly detected
    expect(result.metadata!.publishingNodes).toBe(1);
  });

  it('40: Video Localization v1 has zero publishing nodes', () => {
    const spec: WorkflowSpecification = {
      nodes: [
        { node_key: 'src', node_type: 'source', display_name: 'I', position_index: 0, config_json: {}, capability: 'video_download' },
        { node_key: 'p1', node_type: 'process', display_name: 'P', position_index: 1, config_json: {}, capability: 'stt' },
        { node_key: 'rev', node_type: 'review', display_name: 'R', position_index: 2, config_json: {}, capability: 'human_review' },
      ],
      edges: [
        { from_node_key: 'src', to_node_key: 'p1', edge_type: 'sequence' },
        { from_node_key: 'p1', to_node_key: 'rev', edge_type: 'sequence' },
      ],
    };
    const result = validateWorkflowVersion(spec);
    expect(result.valid).toBe(true);
    expect(result.metadata!.publishingNodes).toBe(0);
  });
});
