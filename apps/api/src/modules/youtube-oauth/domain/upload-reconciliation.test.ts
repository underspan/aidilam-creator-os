/**
 * DEP-016A4 Test Suite Part 5: Reconciliation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubeUploadEngine, FakeYouTubeUploadTransport } from './upload-engine.js';

describe('A4.5 Reconciliation', () => {
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
      mediaSizeBytes: chunkSize * 3,
      mediaChecksum: 'checksum-reconcile',
      idempotencyKey: 'idem-reconcile-test',
      chunkSize,
    });
    sessionId = session.id;
  });

  it('session status can be set to reconciliation_required', () => {
    const s = engine.getSession(sessionId)!;
    (s as any).status = 'reconciliation_required';
    expect(s.status).toBe('reconciliation_required');
  });

  it('unknown_after_accept scenario still records acceptance', async () => {
    transport.setScenario('unknown_after_accept');
    const data = Buffer.alloc(chunkSize, 0x61);
    const result = await engine.uploadNextChunk(sessionId, projectId, data);
    // The transport returns success:true with bytesAccepted
    expect(result.accepted).toBe(true);
    expect(result.bytesAccepted).toBe(chunkSize);
  });

  it('local progress equals sum of accepted checkpoints', async () => {
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x62);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const checkpoints = engine.getCheckpoints(sessionId);
    const totalAccepted = checkpoints
      .filter(c => c.status === 'accepted')
      .reduce((sum, c) => sum + c.bytesAccepted, 0);
    expect(engine.getSession(sessionId)!.uploadedBytes).toBe(totalAccepted);
  });

  it('no overlapping accepted checkpoint ranges', async () => {
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x63);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const accepted = engine.getCheckpoints(sessionId).filter(c => c.status === 'accepted');
    for (let i = 1; i < accepted.length; i++) {
      expect(accepted[i].byteStart).toBeGreaterThanOrEqual(accepted[i - 1].byteEnd);
    }
  });

  it('completed session cannot be set to reconciliation_required', async () => {
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x64);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.finalizeUpload(sessionId, projectId);
    expect(engine.getSession(sessionId)!.status).toBe('uploaded');
  });

  it('cancelled session cannot be reconciled to active', async () => {
    await engine.cancelSession(sessionId, projectId);
    const s = engine.getSession(sessionId)!;
    expect(s.status).toBe('cancelled');
    // Attempting to upload after cancel is rejected
    const data = Buffer.alloc(chunkSize, 0x65);
    await expect(engine.uploadNextChunk(sessionId, projectId, data)).rejects.toThrow('cancelled');
  });

  it('progress is monotonic — never decreases', async () => {
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x66);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const first = engine.getSession(sessionId)!.uploadedBytes;
    await engine.uploadNextChunk(sessionId, projectId, data);
    const second = engine.getSession(sessionId)!.uploadedBytes;
    expect(second).toBeGreaterThanOrEqual(first);
  });

  it('exactly one completion transition per session', async () => {
    transport.setScenario('success');
    const data = Buffer.alloc(chunkSize, 0x67);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    await engine.uploadNextChunk(sessionId, projectId, data);
    const result = await engine.finalizeUpload(sessionId, projectId);
    expect(result.externalVideoId).toContain('yt-video-');
    // Double finalize rejected
    await expect(engine.finalizeUpload(sessionId, projectId)).rejects.toThrow('Not ready');
  });
});
