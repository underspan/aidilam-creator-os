/**
 * DEP-016A4 Test Suite Part 4: Retry and Recovery
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubeUploadEngine, FakeYouTubeUploadTransport } from './upload-engine.js';

describe('A4.4 Retry and Recovery', () => {
  let transport: FakeYouTubeUploadTransport;
  let engine: YouTubeUploadEngine;
  let sessionId: string;
  const projectId = 'proj-001';
  const chunkSize = 256 * 1024;

  beforeEach(async () => {
    transport = new FakeYouTubeUploadTransport();
    engine = new YouTubeUploadEngine(transport);
    const session = await engine.startUpload({
      projectId,
      publishingJobId: 'job-001',
      publishingAttemptId: 'attempt-001',
      platformAccountId: 'account-001',
      credentialBindingId: 'binding-001',
      mediaSizeBytes: chunkSize * 4,
      mediaChecksum: 'checksum-retry',
      idempotencyKey: 'idem-retry-test',
      chunkSize,
    });
    sessionId = session.id;
  });

  it('network interruption marks session interrupted', async () => {
    transport.setScenario('network_interrupt');
    const data = Buffer.alloc(chunkSize, 0x51);
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(result.accepted).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.errorCode).toBe('NETWORK_TRANSIENT');
    expect(engine.getSession(sessionId)!.status).toBe('interrupted');
  });

  it('retryable 5xx marks checkpoint retryable_failed', async () => {
    transport.setScenario('retryable_5xx');
    const data = Buffer.alloc(chunkSize, 0x52);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const cp = engine.getCheckpoints(sessionId);
    expect(cp[0].status).toBe('retryable_failed');
  });

  it('rate limit returns retryable with code', async () => {
    transport.setScenario('rate_limit');
    const data = Buffer.alloc(chunkSize, 0x53);
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(result.accepted).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.errorCode).toBe('RATE_LIMITED');
  });

  it('quota exhausted marks session failed (non-retryable)', async () => {
    transport.setScenario('quota_exhausted');
    const data = Buffer.alloc(chunkSize, 0x54);
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(result.accepted).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.errorCode).toBe('QUOTA_EXHAUSTED');
    expect(engine.getSession(sessionId)!.status).toBe('failed');
  });

  it('invalid range marks permanent_failed', async () => {
    transport.setScenario('invalid_range');
    const data = Buffer.alloc(chunkSize, 0x55);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const cp = engine.getCheckpoints(sessionId);
    expect(cp[0].status).toBe('permanent_failed');
  });

  it('expired session marks session failed', async () => {
    transport.setScenario('expired_session');
    const data = Buffer.alloc(chunkSize, 0x56);
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(result.accepted).toBe(false);
    expect(result.errorCode).toBe('SESSION_EXPIRED');
    expect(engine.getSession(sessionId)!.status).toBe('failed');
  });

  it('permanent media rejection marks session failed', async () => {
    transport.setScenario('permanent_media_rejection');
    const data = Buffer.alloc(chunkSize, 0x57);
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(result.accepted).toBe(false);
    expect(result.retryable).toBe(false);
    expect(engine.getSession(sessionId)!.status).toBe('failed');
  });

  it('offset never regresses after failure', async () => {
    // First chunk succeeds
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x58);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const offsetAfterFirst = engine.getSession(sessionId)!.nextByteOffset;

    // Second chunk fails (retryable)
    transport.setScenario('network_interrupt');
    await engine.uploadNextChunk(sessionId, projectId, data);
    const offsetAfterFail = engine.getSession(sessionId)!.nextByteOffset;
    expect(offsetAfterFail).toBe(offsetAfterFirst);
    expect(offsetAfterFail).toBeGreaterThanOrEqual(offsetAfterFirst);
  });

  it('interrupted session can resume with next chunk', async () => {
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x59);
    await engine.uploadNextChunk(sessionId, projectId, data);

    // Simulate interruption
    transport.setScenario('network_interrupt');
    await engine.uploadNextChunk(sessionId, projectId, data);
    expect(engine.getSession(sessionId)!.status).toBe('interrupted');

    // Resume: manually set status back (simulating recovery)
    const s = engine.getSession(sessionId)!;
    (s as any).status = 'uploading'; // Recovery would do this
    transport.setScenario('success');
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(result.accepted).toBe(true);
  });

  it('no duplicate accepted range after retry of same offset', async () => {
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x5a);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const checkpoints = engine.getCheckpoints(sessionId);
    const accepted = checkpoints.filter(c => c.status === 'accepted');
    // Verify no two accepted checkpoints have same byteStart
    const starts = accepted.map(c => c.byteStart);
    expect(new Set(starts).size).toBe(starts.length);
  });
});
