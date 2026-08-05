/**
 * DEP-016A4 Test Suite Part 3: Upload Chunk Behavior
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubeUploadEngine, FakeYouTubeUploadTransport } from './upload-engine.js';

describe('A4.3 Upload Chunk Behavior', () => {
  let transport: FakeYouTubeUploadTransport;
  let engine: YouTubeUploadEngine;
  let sessionId: string;
  const projectId = 'proj-001';
  const chunkSize = 256 * 1024; // 256KB min

  beforeEach(async () => {
    transport = new FakeYouTubeUploadTransport();
    engine = new YouTubeUploadEngine(transport);
    const session = await engine.startUpload({
      projectId,
      publishingJobId: 'job-001',
      publishingAttemptId: 'attempt-001',
      platformAccountId: 'account-001',
      credentialBindingId: 'binding-001',
      mediaSizeBytes: chunkSize * 3,
      mediaChecksum: 'checksum-abc',
      idempotencyKey: 'idem-chunk-test',
      chunkSize,
    });
    sessionId = session.id;
  });

  it('accepts first chunk and advances offset', async () => {
    const data = Buffer.alloc(chunkSize, 0x41);
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(result.accepted).toBe(true);
    expect(result.bytesAccepted).toBe(chunkSize);
    const s = engine.getSession(sessionId)!;
    expect(s.uploadedBytes).toBe(chunkSize);
    expect(s.nextByteOffset).toBe(chunkSize);
  });

  it('multiple chunks advance progress monotonically', async () => {
    const data = Buffer.alloc(chunkSize, 0x42);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const s = engine.getSession(sessionId)!;
    expect(s.uploadedBytes).toBe(chunkSize * 2);
    expect(s.nextByteOffset).toBe(chunkSize * 2);
  });

  it('creates checkpoint for each chunk', async () => {
    const data = Buffer.alloc(chunkSize, 0x43);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const checkpoints = engine.getCheckpoints(sessionId);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].status).toBe('accepted');
    expect(checkpoints[0].byteStart).toBe(0);
    expect(checkpoints[0].byteEnd).toBe(chunkSize);
  });

  it('checkpoint has valid checksum', async () => {
    const data = Buffer.alloc(chunkSize, 0x44);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const cp = engine.getCheckpoints(sessionId)[0];
    expect(cp.chunkChecksum).toHaveLength(16);
    expect(cp.transportRequestId).toBeDefined();
  });

  it('transitions session to uploading during chunk', async () => {
    const data = Buffer.alloc(chunkSize, 0x45);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const s = engine.getSession(sessionId)!;
    // After successful chunk, still uploading until all bytes done
    expect(['uploading', 'completing']).toContain(s.status);
  });

  it('transitions to completing when all bytes accepted', async () => {
    const data = Buffer.alloc(chunkSize, 0x46);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const s = engine.getSession(sessionId)!;
    expect(s.status).toBe('completing');
    expect(s.uploadedBytes).toBe(chunkSize * 3);
  });

  it('partial acceptance advances by accepted amount only', async () => {
    transport.setScenario('partial_accept');
    const data = Buffer.alloc(chunkSize, 0x47);
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(result.accepted).toBe(true);
    expect(result.bytesAccepted).toBe(Math.floor(chunkSize / 2));
    const s = engine.getSession(sessionId)!;
    expect(s.uploadedBytes).toBe(Math.floor(chunkSize / 2));
  });

  it('duplicate chunk acknowledgment is safe (accepted)', async () => {
    transport.setScenario('duplicate_chunk');
    const data = Buffer.alloc(chunkSize, 0x48);
    const r1 = await engine.uploadNextChunk(sessionId, projectId, data);
    expect(r1.accepted).toBe(true);
  });

  it('rejects chunk on cancelled session', async () => {
    await engine.cancelSession(sessionId, projectId);
    const data = Buffer.alloc(chunkSize, 0x49);
    await expect(engine.uploadNextChunk(sessionId, projectId, data)).rejects.toThrow('cancelled');
  });

  it('rejects chunk on already-completed session', async () => {
    const data = Buffer.alloc(chunkSize, 0x4a);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.finalizeUpload(sessionId, projectId);
    await expect(engine.uploadNextChunk(sessionId, projectId, data)).rejects.toThrow('completed');
  });

  it('rejects chunk on failed session', async () => {
    transport.setScenario('quota_exhausted');
    const data = Buffer.alloc(chunkSize, 0x4b);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await expect(engine.uploadNextChunk(sessionId, projectId, data)).rejects.toThrow('failed');
  });

  it('cross-project chunk upload denied', async () => {
    const data = Buffer.alloc(chunkSize, 0x4c);
    await expect(engine.uploadNextChunk(sessionId, 'other-project', data)).rejects.toThrow('Cross-project');
  });
});
