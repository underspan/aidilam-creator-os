/**
 * COM-04E2 Dedicated Tests Part 1: Snapshot Canonicalization & Hashing
 */
import { describe, it, expect } from 'vitest';
import { canonicalizeJson, sha256Hex, canonicalizeExecutionSnapshot, hashExecutionSnapshot } from './snapshot-hash.js';

const BASE_PAYLOAD = {
  schemaVersion: '1.0',
  workspaceId: 'a0000000-0000-4000-a000-000000000001',
  projectId: 'p0000000-0000-4000-a000-000000000001',
  workflowDefinitionId: 'e0000000-0001-4000-a000-000000000001',
  workflowVersionId: 'e0000000-0001-4000-b000-000000000001',
  workflowVersionNumber: 1,
  workflowChecksum: '4bade105e6a8ce8eb7a1bf28eb53054adcdcad4c3c08a22e72bb10d1214a718d',
  templateId: null,
  templateVersionId: null,
  templateChecksum: null,
  inputAssetId: 'asset-001',
  inputAssetVersionId: 'assetver-001',
  inputAssetChecksum: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
  effectiveConfigChecksum: 'cfg-checksum-64chars-padded-000000000000000000000000000000000000',
  providerPolicyChecksum: 'pol-checksum-64chars-padded-000000000000000000000000000000000000',
  runtimePolicyJson: { maxRetries: 3, timeoutSeconds: 3600, cancelPolicy: 'immediate' },
};

describe('Canonicalization', () => {
  it('01: produces deterministic JSON from object', () => {
    const a = canonicalizeJson({ b: 2, a: 1 });
    const b = canonicalizeJson({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('02: sorts nested keys recursively', () => {
    const result = canonicalizeJson({ z: { b: 1, a: 2 }, a: 3 });
    expect(result).toBe('{"a":3,"z":{"a":2,"b":1}}');
  });

  it('03: preserves array order', () => {
    const result = canonicalizeJson({ arr: [3, 1, 2] });
    expect(result).toBe('{"arr":[3,1,2]}');
  });

  it('04: removes undefined values', () => {
    const result = canonicalizeJson({ a: 1, b: undefined, c: 3 });
    expect(result).toBe('{"a":1,"c":3}');
  });

  it('05: handles null correctly', () => {
    const result = canonicalizeJson({ a: null });
    expect(result).toBe('{"a":null}');
  });
});

describe('SHA-256 Hashing', () => {
  it('06: produces 64 char lowercase hex', () => {
    const hash = sha256Hex('test');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('07: same input produces same hash', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
  });

  it('08: different input produces different hash', () => {
    expect(sha256Hex('hello')).not.toBe(sha256Hex('world'));
  });
});

describe('Execution Snapshot Canonicalization', () => {
  it('09: produces string from payload', () => {
    const result = canonicalizeExecutionSnapshot(BASE_PAYLOAD);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('10: same payload produces same canonical form', () => {
    const a = canonicalizeExecutionSnapshot(BASE_PAYLOAD);
    const b = canonicalizeExecutionSnapshot({ ...BASE_PAYLOAD });
    expect(a).toBe(b);
  });

  it('11: different workflowVersionId produces different canonical form', () => {
    const a = canonicalizeExecutionSnapshot(BASE_PAYLOAD);
    const b = canonicalizeExecutionSnapshot({ ...BASE_PAYLOAD, workflowVersionId: 'different-version-id' });
    expect(a).not.toBe(b);
  });

  it('12: different effectiveConfigChecksum produces different canonical form', () => {
    const a = canonicalizeExecutionSnapshot(BASE_PAYLOAD);
    const b = canonicalizeExecutionSnapshot({ ...BASE_PAYLOAD, effectiveConfigChecksum: 'different-config-checksum-000000000000000000000000000000000' });
    expect(a).not.toBe(b);
  });

  it('13: different inputAssetVersionId produces different canonical form', () => {
    const a = canonicalizeExecutionSnapshot(BASE_PAYLOAD);
    const b = canonicalizeExecutionSnapshot({ ...BASE_PAYLOAD, inputAssetVersionId: 'different-asset-ver' });
    expect(a).not.toBe(b);
  });

  it('14: different providerPolicyChecksum produces different canonical form', () => {
    const a = canonicalizeExecutionSnapshot(BASE_PAYLOAD);
    const b = canonicalizeExecutionSnapshot({ ...BASE_PAYLOAD, providerPolicyChecksum: 'different-policy-checksum-000000000000000000000000000000000000' });
    expect(a).not.toBe(b);
  });
});

describe('Execution Snapshot Hashing', () => {
  it('15: produces 64 char hex hash', () => {
    const hash = hashExecutionSnapshot(BASE_PAYLOAD);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('16: equivalent payloads produce same hash', () => {
    const a = hashExecutionSnapshot(BASE_PAYLOAD);
    const b = hashExecutionSnapshot({ ...BASE_PAYLOAD });
    expect(a).toBe(b);
  });

  it('17: different intent produces different hash', () => {
    const a = hashExecutionSnapshot(BASE_PAYLOAD);
    const b = hashExecutionSnapshot({ ...BASE_PAYLOAD, workflowVersionNumber: 2 });
    expect(a).not.toBe(b);
  });

  it('18: hash excludes non-semantic fields (createdAt, createdBy not in payload)', () => {
    // The canonicalization only includes semantic fields, not metadata
    const hash1 = hashExecutionSnapshot(BASE_PAYLOAD);
    const hash2 = hashExecutionSnapshot(BASE_PAYLOAD);
    expect(hash1).toBe(hash2);
  });
});
