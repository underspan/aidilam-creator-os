import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalJson, computeJobFingerprint } from './fingerprint.js';

describe('canonicalize', () => {
  it('sorts object keys alphabetically', () => {
    const result = canonicalize({ b: 2, a: 1 });
    expect(JSON.stringify(result)).toBe('{"a":1,"b":2}');
  });

  it('sorts nested object keys recursively', () => {
    const result = canonicalize({ z: { b: 2, a: 1 }, a: 1 });
    expect(JSON.stringify(result)).toBe('{"a":1,"z":{"a":1,"b":2}}');
  });

  it('preserves array order', () => {
    const result = canonicalize([3, 1, 2]);
    expect(JSON.stringify(result)).toBe('[3,1,2]');
  });

  it('canonicalizes array elements', () => {
    const result = canonicalize([{ b: 1, a: 2 }]);
    expect(JSON.stringify(result)).toBe('[{"a":2,"b":1}]');
  });

  it('preserves null', () => {
    expect(canonicalize(null)).toBe(null);
  });

  it('omits undefined values from objects', () => {
    const result = canonicalize({ a: 1, b: undefined, c: 3 });
    expect(JSON.stringify(result)).toBe('{"a":1,"c":3}');
  });

  it('distinguishes numbers from strings', () => {
    const num = canonicalJson({ a: 1 });
    const str = canonicalJson({ a: '1' });
    expect(num).not.toBe(str);
  });

  it('handles boolean values', () => {
    expect(canonicalJson({ a: true })).toBe('{"a":true}');
    expect(canonicalJson({ a: false })).toBe('{"a":false}');
  });

  it('handles empty objects', () => {
    expect(canonicalJson({})).toBe('{}');
  });

  it('handles empty arrays', () => {
    expect(canonicalJson([])).toBe('[]');
  });

  it('handles deeply nested structures', () => {
    const a = { z: { y: { x: { w: 1 } } } };
    const b = { z: { y: { x: { w: 1 } } } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('handles Unicode strings', () => {
    const result = canonicalJson({ name: 'AIĐILÀM', desc: 'Hệ thống' });
    expect(result).toContain('AIĐILÀM');
    expect(result).toContain('Hệ thống');
  });
});

describe('canonicalJson', () => {
  it('produces same output for reordered keys', () => {
    const a = canonicalJson({ jobType: 'integration_test', input: { a: 1, b: 2 } });
    const b = canonicalJson({ input: { b: 2, a: 1 }, jobType: 'integration_test' });
    expect(a).toBe(b);
  });

  it('produces different output for different values', () => {
    const a = canonicalJson({ input: { a: 1 } });
    const b = canonicalJson({ input: { a: '1' } });
    expect(a).not.toBe(b);
  });

  it('produces different output for different keys', () => {
    const a = canonicalJson({ a: 1 });
    const b = canonicalJson({ b: 1 });
    expect(a).not.toBe(b);
  });
});

describe('computeJobFingerprint', () => {
  const baseInput = {
    actorId: 'actor-1',
    projectId: 'project-1',
    jobType: 'integration_test',
    priority: 50,
    timeoutSeconds: 300,
    inputPayload: { mode: 'success' },
  };

  it('produces consistent fingerprint for same input', () => {
    const f1 = computeJobFingerprint(baseInput);
    const f2 = computeJobFingerprint(baseInput);
    expect(f1).toBe(f2);
    expect(f1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces same fingerprint for reordered inputPayload', () => {
    const f1 = computeJobFingerprint({ ...baseInput, inputPayload: { a: 1, b: 2 } });
    const f2 = computeJobFingerprint({ ...baseInput, inputPayload: { b: 2, a: 1 } });
    expect(f1).toBe(f2);
  });

  it('produces different fingerprint for changed priority', () => {
    const f1 = computeJobFingerprint(baseInput);
    const f2 = computeJobFingerprint({ ...baseInput, priority: 10 });
    expect(f1).not.toBe(f2);
  });

  it('produces different fingerprint for changed inputPayload', () => {
    const f1 = computeJobFingerprint(baseInput);
    const f2 = computeJobFingerprint({ ...baseInput, inputPayload: { mode: 'fail_permanent' } });
    expect(f1).not.toBe(f2);
  });

  it('produces different fingerprint for changed timeout', () => {
    const f1 = computeJobFingerprint(baseInput);
    const f2 = computeJobFingerprint({ ...baseInput, timeoutSeconds: 60 });
    expect(f1).not.toBe(f2);
  });

  it('produces different fingerprint for different actor', () => {
    const f1 = computeJobFingerprint(baseInput);
    const f2 = computeJobFingerprint({ ...baseInput, actorId: 'actor-2' });
    expect(f1).not.toBe(f2);
  });

  it('produces different fingerprint for different project', () => {
    const f1 = computeJobFingerprint(baseInput);
    const f2 = computeJobFingerprint({ ...baseInput, projectId: 'project-2' });
    expect(f1).not.toBe(f2);
  });

  it('handles null inputPayload', () => {
    const f1 = computeJobFingerprint({ ...baseInput, inputPayload: null });
    const f2 = computeJobFingerprint({ ...baseInput, inputPayload: null });
    expect(f1).toBe(f2);
  });

  it('distinguishes null from empty object', () => {
    const f1 = computeJobFingerprint({ ...baseInput, inputPayload: null });
    const f2 = computeJobFingerprint({ ...baseInput, inputPayload: {} });
    expect(f1).not.toBe(f2);
  });
});
