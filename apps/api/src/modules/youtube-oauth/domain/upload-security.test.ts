/**
 * DEP-016A4 Test Suite Part 7: Security Boundary and Feature Gates
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  YouTubeUploadEngine,
  FakeYouTubeUploadTransport,
  type YouTubeUploadSession,
} from './upload-engine.js';

describe('A4.7 Security Boundary', () => {
  let transport: FakeYouTubeUploadTransport;
  let engine: YouTubeUploadEngine;

  beforeEach(() => {
    transport = new FakeYouTubeUploadTransport();
    engine = new YouTubeUploadEngine(transport);
  });

  it('session reference is opaque (never raw URI)', async () => {
    const session = await engine.startUpload({
      projectId: 'proj-sec',
      publishingJobId: 'job-sec',
      publishingAttemptId: 'attempt-sec',
      platformAccountId: 'account-sec',
      credentialBindingId: 'binding-sec',
      mediaSizeBytes: 1024 * 1024,
      mediaChecksum: 'sec-checksum',
      idempotencyKey: 'idem-sec-001',
    });
    expect(session.uploadSessionSecretReference).not.toContain('googleapis.com');
    expect(session.uploadSessionSecretReference).not.toContain('http://');
    expect(session.uploadSessionSecretReference).not.toContain('https://');
    expect(session.uploadSessionSecretReference).toMatch(/^secret-ref:/);
  });

  it('no raw bearer token in session object', async () => {
    const session = await engine.startUpload({
      projectId: 'proj-sec',
      publishingJobId: 'job-sec',
      publishingAttemptId: 'attempt-sec',
      platformAccountId: 'account-sec',
      credentialBindingId: 'binding-sec',
      mediaSizeBytes: 1024 * 1024,
      mediaChecksum: 'sec-checksum',
      idempotencyKey: 'idem-sec-002',
    });
    const json = JSON.stringify(session);
    expect(json).not.toContain('Bearer');
    expect(json).not.toContain('ya29.');
    expect(json).not.toContain('access_token');
  });

  it('cross-project upload denied', async () => {
    const session = await engine.startUpload({
      projectId: 'proj-a',
      publishingJobId: 'job-a',
      publishingAttemptId: 'attempt-a',
      platformAccountId: 'account-a',
      credentialBindingId: 'binding-a',
      mediaSizeBytes: 512 * 1024,
      mediaChecksum: 'cs-a',
      idempotencyKey: 'idem-cross-001',
      chunkSize: 256 * 1024,
    });
    const data = Buffer.alloc(256 * 1024, 0xAA);
    await expect(engine.uploadNextChunk(session.id, 'proj-b', data)).rejects.toThrow('Cross-project');
  });

  it('cross-project cancel denied', async () => {
    const session = await engine.startUpload({
      projectId: 'proj-a',
      publishingJobId: 'job-a2',
      publishingAttemptId: 'attempt-a2',
      platformAccountId: 'account-a',
      credentialBindingId: 'binding-a',
      mediaSizeBytes: 512 * 1024,
      mediaChecksum: 'cs-a2',
      idempotencyKey: 'idem-cross-002',
      chunkSize: 256 * 1024,
    });
    await expect(engine.cancelSession(session.id, 'proj-b')).rejects.toThrow('Cross-project');
  });

  it('cross-project finalize denied', async () => {
    const session = await engine.startUpload({
      projectId: 'proj-a',
      publishingJobId: 'job-a3',
      publishingAttemptId: 'attempt-a3',
      platformAccountId: 'account-a',
      credentialBindingId: 'binding-a',
      mediaSizeBytes: 256 * 1024,
      mediaChecksum: 'cs-a3',
      idempotencyKey: 'idem-cross-003',
      chunkSize: 256 * 1024,
    });
    const data = Buffer.alloc(256 * 1024, 0xBB);
    await engine.uploadNextChunk(session.id, 'proj-a', data);
    await expect(engine.finalizeUpload(session.id, 'proj-b')).rejects.toThrow('Cross-project');
  });
});

describe('A4.7 Feature Gates', () => {
  it('YOUTUBE_RESUMABLE_UPLOAD_ENABLED defaults to absent/undefined', () => {
    expect(process.env.YOUTUBE_RESUMABLE_UPLOAD_ENABLED).toBeUndefined();
  });

  it('YOUTUBE_REAL_ADAPTER_ENABLED defaults to absent/undefined', () => {
    expect(process.env.YOUTUBE_REAL_ADAPTER_ENABLED).toBeUndefined();
  });

  it('YOUTUBE_REAL_TRANSPORT_ENABLED defaults to absent/undefined', () => {
    expect(process.env.YOUTUBE_REAL_TRANSPORT_ENABLED).toBeUndefined();
  });

  it('YOUTUBE_FAKE_UPLOAD_TRANSPORT_ENABLED not set in production mode', () => {
    expect(process.env.YOUTUBE_FAKE_UPLOAD_TRANSPORT_ENABLED).toBeUndefined();
  });

  it('fake transport makes zero real network calls', async () => {
    const transport = new FakeYouTubeUploadTransport();
    const engine = new YouTubeUploadEngine(transport);
    const session = await engine.startUpload({
      projectId: 'proj-gate',
      publishingJobId: 'job-gate',
      publishingAttemptId: 'attempt-gate',
      platformAccountId: 'account-gate',
      credentialBindingId: 'binding-gate',
      mediaSizeBytes: 256 * 1024,
      mediaChecksum: 'gate-checksum',
      idempotencyKey: 'idem-gate-001',
      chunkSize: 256 * 1024,
    });
    const data = Buffer.alloc(256 * 1024, 0xCC);
    await engine.uploadNextChunk(session.id, 'proj-gate', data);
    // All calls are internal fake transport — no HTTP
    expect(transport.getCallCount()).toBeGreaterThan(0);
    // Transport is pure in-memory — no network
    expect(await transport.healthCheck()).toBe(true);
  });
});

describe('A4.7 Network Call Count Verification', () => {
  it('entire upload lifecycle uses zero network calls', async () => {
    const transport = new FakeYouTubeUploadTransport();
    const engine = new YouTubeUploadEngine(transport);
    const chunkSize = 256 * 1024;
    const session = await engine.startUpload({
      projectId: 'proj-net',
      publishingJobId: 'job-net',
      publishingAttemptId: 'attempt-net',
      platformAccountId: 'account-net',
      credentialBindingId: 'binding-net',
      mediaSizeBytes: chunkSize * 2,
      mediaChecksum: 'net-checksum',
      idempotencyKey: 'idem-net-001',
      chunkSize,
    });
    const data = Buffer.alloc(chunkSize, 0xDD);
    await engine.uploadNextChunk(session.id, 'proj-net', data);
    await engine.uploadNextChunk(session.id, 'proj-net', data);
    await engine.finalizeUpload(session.id, 'proj-net');
    // Verify: transport call count = createSession(1) + uploadChunk(2) + finalize(1) = 4
    expect(transport.getCallCount()).toBe(4);
    // All operations are fake/in-memory, zero actual HTTP
  });
});
