/**
 * COM-04E2 Dedicated Tests Part 2: State Machine
 */
import { describe, it, expect } from 'vitest';
import {
  transitionWorkflowExecution, transitionNodeExecution,
  isNodeReady, calculateProgress,
} from './state-machine.js';
import { ExecutionStatus, NodeStatus } from './types.js';

describe('Execution State Machine - Valid Transitions', () => {
  it('19: prepared → running', () => {
    const r = transitionWorkflowExecution('prepared', 'running', 1, 1);
    expect(r.success).toBe(true);
  });

  it('20: prepared → cancelled', () => {
    const r = transitionWorkflowExecution('prepared', 'cancelled', 1, 1);
    expect(r.success).toBe(true);
  });

  it('21: running → succeeded', () => {
    const r = transitionWorkflowExecution('running', 'succeeded', 2, 2);
    expect(r.success).toBe(true);
  });

  it('22: running → failed', () => {
    const r = transitionWorkflowExecution('running', 'failed', 2, 2);
    expect(r.success).toBe(true);
  });

  it('23: running → cancel_requested', () => {
    const r = transitionWorkflowExecution('running', 'cancel_requested', 2, 2);
    expect(r.success).toBe(true);
  });

  it('24: cancel_requested → cancelled', () => {
    const r = transitionWorkflowExecution('cancel_requested', 'cancelled', 3, 3);
    expect(r.success).toBe(true);
  });

  it('25: cancel_requested → succeeded (late completion)', () => {
    const r = transitionWorkflowExecution('cancel_requested', 'succeeded', 3, 3);
    expect(r.success).toBe(true);
  });
});

describe('Execution State Machine - Invalid Transitions', () => {
  it('26: succeeded → running rejected', () => {
    const r = transitionWorkflowExecution('succeeded', 'running', 5, 5);
    expect(r.success).toBe(false);
    expect(r.error).toBe('EXECUTION_TERMINAL');
  });

  it('27: cancelled → running rejected', () => {
    const r = transitionWorkflowExecution('cancelled', 'running', 4, 4);
    expect(r.success).toBe(false);
    expect(r.error).toBe('EXECUTION_TERMINAL');
  });

  it('28: failed → succeeded rejected (no direct)', () => {
    const r = transitionWorkflowExecution('failed', 'succeeded', 5, 5);
    expect(r.success).toBe(false);
    expect(r.error).toBe('EXECUTION_TERMINAL');
  });

  it('29: prepared → succeeded rejected (skip running)', () => {
    const r = transitionWorkflowExecution('prepared', 'succeeded', 1, 1);
    expect(r.success).toBe(false);
    expect(r.error).toBe('INVALID_EXECUTION_TRANSITION');
  });

  it('30: prepared → failed rejected', () => {
    const r = transitionWorkflowExecution('prepared', 'failed', 1, 1);
    expect(r.success).toBe(false);
    expect(r.error).toBe('INVALID_EXECUTION_TRANSITION');
  });
});

describe('Execution State Machine - Concurrency', () => {
  it('31: state version mismatch rejects transition', () => {
    const r = transitionWorkflowExecution('prepared', 'running', 2, 1);
    expect(r.success).toBe(false);
    expect(r.error).toBe('STATE_VERSION_MISMATCH');
  });

  it('32: terminal idempotency (same state)', () => {
    const r = transitionWorkflowExecution('succeeded', 'succeeded', 5, 5);
    expect(r.success).toBe(true);
  });
});

describe('Node State Machine - Valid Transitions', () => {
  it('33: pending → ready', () => {
    const r = transitionNodeExecution('pending', 'ready', 1, 1);
    expect(r.success).toBe(true);
  });

  it('34: ready → running', () => {
    const r = transitionNodeExecution('ready', 'running', 2, 2);
    expect(r.success).toBe(true);
  });

  it('35: running → succeeded', () => {
    const r = transitionNodeExecution('running', 'succeeded', 3, 3);
    expect(r.success).toBe(true);
  });

  it('36: running → failed', () => {
    const r = transitionNodeExecution('running', 'failed', 3, 3);
    expect(r.success).toBe(true);
  });

  it('37: running → cancelled', () => {
    const r = transitionNodeExecution('running', 'cancelled', 3, 3);
    expect(r.success).toBe(true);
  });

  it('38: failed → ready (retry)', () => {
    const r = transitionNodeExecution('failed', 'ready', 4, 4);
    expect(r.success).toBe(true);
  });

  it('39: pending → cancelled', () => {
    const r = transitionNodeExecution('pending', 'cancelled', 1, 1);
    expect(r.success).toBe(true);
  });

  it('40: pending → skipped', () => {
    const r = transitionNodeExecution('pending', 'skipped', 1, 1);
    expect(r.success).toBe(true);
  });
});

describe('Node State Machine - Invalid Transitions', () => {
  it('41: succeeded → running rejected', () => {
    const r = transitionNodeExecution('succeeded', 'running', 4, 4);
    expect(r.success).toBe(false);
    expect(r.error).toBe('NODE_TERMINAL');
  });

  it('42: cancelled → ready rejected', () => {
    const r = transitionNodeExecution('cancelled', 'ready', 3, 3);
    expect(r.success).toBe(false);
    expect(r.error).toBe('NODE_TERMINAL');
  });

  it('43: pending → succeeded rejected (skip running)', () => {
    const r = transitionNodeExecution('pending', 'succeeded', 1, 1);
    expect(r.success).toBe(false);
    expect(r.error).toBe('INVALID_NODE_TRANSITION');
  });

  it('44: ready → succeeded rejected (skip running)', () => {
    const r = transitionNodeExecution('ready', 'succeeded', 2, 2);
    expect(r.success).toBe(false);
    expect(r.error).toBe('INVALID_NODE_TRANSITION');
  });

  it('45: node state version mismatch', () => {
    const r = transitionNodeExecution('pending', 'ready', 2, 1);
    expect(r.success).toBe(false);
    expect(r.error).toBe('STATE_VERSION_MISMATCH');
  });
});

describe('DAG Readiness Check', () => {
  const linearEdges = [
    { from_node_key: 'source', to_node_key: 'stt' },
    { from_node_key: 'stt', to_node_key: 'translate' },
    { from_node_key: 'translate', to_node_key: 'review' },
  ];

  it('46: source node (no predecessors) is always ready', () => {
    const statuses = new Map<string, NodeStatus>([['source', 'pending'], ['stt', 'pending']]);
    expect(isNodeReady('source', linearEdges, statuses)).toBe(true);
  });

  it('47: node with pending predecessor is not ready', () => {
    const statuses = new Map<string, NodeStatus>([['source', 'pending'], ['stt', 'pending']]);
    expect(isNodeReady('stt', linearEdges, statuses)).toBe(false);
  });

  it('48: node with succeeded predecessor is ready', () => {
    const statuses = new Map<string, NodeStatus>([['source', 'succeeded'], ['stt', 'pending']]);
    expect(isNodeReady('stt', linearEdges, statuses)).toBe(true);
  });

  it('49: node with multiple predecessors waits for all', () => {
    const multiEdges = [
      { from_node_key: 'a', to_node_key: 'merge' },
      { from_node_key: 'b', to_node_key: 'merge' },
    ];
    const statuses = new Map<string, NodeStatus>([['a', 'succeeded'], ['b', 'pending'], ['merge', 'pending']]);
    expect(isNodeReady('merge', multiEdges, statuses)).toBe(false);
  });

  it('50: node with all predecessors succeeded is ready', () => {
    const multiEdges = [
      { from_node_key: 'a', to_node_key: 'merge' },
      { from_node_key: 'b', to_node_key: 'merge' },
    ];
    const statuses = new Map<string, NodeStatus>([['a', 'succeeded'], ['b', 'succeeded'], ['merge', 'pending']]);
    expect(isNodeReady('merge', multiEdges, statuses)).toBe(true);
  });
});

describe('Progress Calculation', () => {
  it('51: empty map = 0%', () => {
    expect(calculateProgress(new Map())).toBe(0);
  });

  it('52: all pending = 0%', () => {
    const m = new Map<string, NodeStatus>([['a', 'pending'], ['b', 'pending']]);
    expect(calculateProgress(m)).toBe(0);
  });

  it('53: half succeeded = 50%', () => {
    const m = new Map<string, NodeStatus>([['a', 'succeeded'], ['b', 'pending']]);
    expect(calculateProgress(m)).toBe(50);
  });

  it('54: all succeeded = 100%', () => {
    const m = new Map<string, NodeStatus>([['a', 'succeeded'], ['b', 'succeeded']]);
    expect(calculateProgress(m)).toBe(100);
  });

  it('55: failed nodes dont count as progress', () => {
    const m = new Map<string, NodeStatus>([['a', 'succeeded'], ['b', 'failed'], ['c', 'pending']]);
    expect(calculateProgress(m)).toBe(33);
  });
});
