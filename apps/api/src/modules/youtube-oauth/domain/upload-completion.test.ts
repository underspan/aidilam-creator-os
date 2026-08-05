/**
 * DEP-016A4 Test Suite Part 6: Completion and Cancellation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubeUploadEngine, FakeYouTubeUploadTransport } from './upload-engine.js';

describe('A4.6 Completion', () => {
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
      mediaSizeBytes: chunkSize * 2,
      mediaChecksum: 'checksum-complete',
      idempotencyKey: 'idem-complete-test',
      chunkSize,
    });
    sessionId = session.id;
  });

  it('finalize returns external video ID', async () => {
    const data = Buffer.alloc(chunkSize, 0x71);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const result = await engine.finalizeUpload(sessionId, projectId);
    expect(result.externalVideoId).toMatch(/^yt-video-/);
  });

  it('session status becomes uploaded after finalization', async () => {
    const data = Buffer.alloc(chunkSize, 0x72);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.finalizeUpload(sessionId, projectId);
    expect(engine.getSession(sessionId)!.status).toBe('uploaded');
  });

  it('finalization rejected if not all bytes uploaded', async () => {
    const data = Buffer.alloc(chunkSize, 0x73);
    await engine.uploadNextChunk(sessionId, projectId, data);
    // Only 1 of 2 chunks uploaded
    await expect(engine.finalizeUpload(sessionId, projectId)).rejects.toThrow('Not ready');
  });

  it('double finalization rejected', async () => {
    const data = Buffer.alloc(chunkSize, 0x74);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.finalizeUpload(sessionId, projectId);
    await expect(engine.finalizeUpload(sessionId, projectId)).rejects.toThrow('Not ready');
  });

  it('cross-project finalization denied', async () => {
    const data = Buffer.alloc(chunkSize, 0x75);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await expect(engine.finalizeUpload(sessionId, 'other-project')).rejects.toThrow('Cross-project');
  });

  it('finalization_delay scenario still returns video ID', async () => {
    transport.setScenario('finalization_delay');
    // Need to upload with success first, then set delay for finalize
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x76);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    transport.setScenario('finalization_delay');
    const result = await engine.finalizeUpload(sessionId, projectId);
    expect(result.externalVideoId).toBeDefined();
  });
});

describe('A4.6 Cancellation', () => {
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
      publishingJobId: 'job-002',
      publishingAttemptId: 'attempt-002',
      platformAccountId: 'account-001',
      credentialBindingId: 'binding-001',
      mediaSizeBytes: chunkSize * 3,
      mediaChecksum: 'checksum-cancel',
      idempotencyKey: 'idem-cancel-test',
      chunkSize,
    });
    sessionId = session.id;
  });

  it('cancel before any upload succeeds', async () => {
    const cancelled = await engine.cancelSession(sessionId, projectId);
    expect(cancelled).toBe(true);
    expect(engine.getSession(sessionId)!.status).toBe('cancelled');
  });

  it('cancel during upload (after partial progress)', async () => {
    const data = Buffer.alloc(chunkSize, 0x81);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const cancelled = await engine.cancelSession(sessionId, projectId);
    expect(cancelled).toBe(true);
    expect(engine.getSession(sessionId)!.status).toBe('cancelled');
  });

  it('repeated cancel is idempotent', async () => {
    await engine.cancelSession(sessionId, projectId);
    const second = await engine.cancelSession(sessionId, projectId);
    expect(second).toBe(true);
  });

  it('cancel prevents further chunk uploads', async () => {
    await engine.cancelSession(sessionId, projectId);
    const data = Buffer.alloc(chunkSize, 0x82);
    await expect(engine.uploadNextChunk(sessionId, projectId, data)).rejects.toThrow('cancelled');
  });

  it('cancel of completed upload is rejected', async () => {
    const data = Buffer.alloc(chunkSize, 0x83);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.finalizeUpload(sessionId, projectId);
    await expect(engine.cancelSession(sessionId, projectId)).rejects.toThrow('Cannot cancel completed');
  });

  it('cross-project cancel denied', async () => {
    await expect(engine.cancelSession(sessionId, 'other-project')).rejects.toThrow('Cross-project');
  });
});
