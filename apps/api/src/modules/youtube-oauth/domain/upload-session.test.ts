/**
 * DEP-016A4 Test Suite Part 2: Session Creation and Idempotency
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubeUploadEngine, FakeYouTubeUploadTransport } from './upload-engine.js';

describe('A4.2 Session Creation and Idempotency', () => {
  let transport: FakeYouTubeUploadTransport;
  let engine: YouTubeUploadEngine;

  const baseInput = {
    projectId: 'proj-001',
    publishingJobId: 'job-001',
    publishingAttemptId: 'attempt-001',
    platformAccountId: 'account-001',
    credentialBindingId: 'binding-001',
    mediaSizeBytes: 50 * 1024 * 1024,
    mediaChecksum: 'abc123def456',
    idempotencyKey: 'idem-key-001',
  };

  beforeEach(() => {
    transport = new FakeYouTubeUploadTransport();
    engine = new YouTubeUploadEngine(transport);
  });

  it('creates a new upload session', async () => {
    const session = await engine.startUpload(baseInput);
    expect(session.id).toBeDefined();
    expect(session.projectId).toBe('proj-001');
    expect(session.status).toBe('ready');
    expect(session.uploadedBytes).toBe(0);
    expect(session.nextByteOffset).toBe(0);
    expect(session.totalBytes).toBe(50 * 1024 * 1024);
  });

  it('stores only opaque secret reference (not raw URI)', async () => {
    const session = await engine.startUpload(baseInput);
    expect(session.uploadSessionSecretReference).toMatch(/^secret-ref:/);
    expect(session.uploadSessionSecretReference).not.toContain('http');
    expect(session.uploadSessionSecretReference).not.toContain('googleapis');
  });

  it('same idempotency key returns same session (replay)', async () => {
    const s1 = await engine.startUpload(baseInput);
    const s2 = await engine.startUpload(baseInput);
    expect(s1.id).toBe(s2.id);
    expect(transport.getCallCount()).toBe(1); // only 1 transport call
  });

  it('same key but different payload causes conflict error', async () => {
    await engine.startUpload(baseInput);
    const conflicting = { ...baseInput, publishingJobId: 'job-different' };
    await expect(engine.startUpload(conflicting)).rejects.toThrow('Idempotency conflict');
  });

  it('different keys create independent sessions', async () => {
    const s1 = await engine.startUpload(baseInput);
    const s2 = await engine.startUpload({ ...baseInput, idempotencyKey: 'idem-key-002' });
    expect(s1.id).not.toBe(s2.id);
  });

  it('rejects zero-byte media', async () => {
    await expect(engine.startUpload({ ...baseInput, mediaSizeBytes: 0 })).rejects.toThrow('Zero-byte');
  });

  it('sets expiry from transport response', async () => {
    const session = await engine.startUpload(baseInput);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('uses default chunk size when not specified', async () => {
    const session = await engine.startUpload(baseInput);
    expect(session.chunkSize).toBe(10 * 1024 * 1024);
  });
});
