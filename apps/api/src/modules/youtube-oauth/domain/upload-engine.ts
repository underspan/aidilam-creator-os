/**
 * YouTube Resumable Upload Engine
 * AIDILAM-DEP-016A4
 *
 * Domain model, fake transport, chunking engine, and use cases.
 * No real Google/YouTube API calls. Fake transport only.
 */
import { randomUUID, createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// Upload Session Status
// ═══════════════════════════════════════════════════════════════════════════════

export type UploadSessionStatus =
  | 'initializing' | 'ready' | 'uploading' | 'interrupted'
  | 'retry_wait' | 'completing' | 'uploaded'
  | 'expired' | 'cancelled' | 'failed' | 'reconciliation_required';

export type CheckpointStatus =
  | 'pending' | 'sending' | 'accepted'
  | 'retryable_failed' | 'permanent_failed' | 'superseded';

// ═══════════════════════════════════════════════════════════════════════════════
// Domain Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface YouTubeUploadSession {
  id: string;
  projectId: string;
  publishingJobId: string;
  publishingAttemptId: string;
  platformAccountId: string;
  credentialBindingId: string;
  uploadSessionSecretReference: string; // opaque vault ref (NEVER raw URI)
  totalBytes: number;
  uploadedBytes: number;
  nextByteOffset: number;
  chunkSize: number;
  mediaChecksum: string;
  status: UploadSessionStatus;
  expiresAt: Date;
  lastActivityAt: Date;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface YouTubeUploadCheckpoint {
  id: string;
  projectId: string;
  uploadSessionId: string;
  byteStart: number;
  byteEnd: number;
  bytesAccepted: number;
  chunkChecksum: string;
  transportRequestId: string;
  status: CheckpointStatus;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chunk Planner
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChunkPlan {
  byteStart: number;
  byteEnd: number; // exclusive
  size: number;
  isFinal: boolean;
  index: number;
}

const MIN_CHUNK_SIZE = 256 * 1024; // 256KB
const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // 64MB
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

export function planChunks(totalBytes: number, requestedChunkSize?: number): ChunkPlan[] {
  if (totalBytes <= 0) throw new Error('Zero-byte media rejected');

  let chunkSize = requestedChunkSize || DEFAULT_CHUNK_SIZE;
  if (chunkSize < MIN_CHUNK_SIZE) throw new Error(`Chunk size below minimum (${MIN_CHUNK_SIZE})`);
  if (chunkSize > MAX_CHUNK_SIZE) throw new Error(`Chunk size above maximum (${MAX_CHUNK_SIZE})`);

  const chunks: ChunkPlan[] = [];
  let offset = 0;
  let index = 0;
  while (offset < totalBytes) {
    const remaining = totalBytes - offset;
    const size = Math.min(chunkSize, remaining);
    chunks.push({
      byteStart: offset,
      byteEnd: offset + size,
      size,
      isFinal: offset + size >= totalBytes,
      index,
    });
    offset += size;
    index++;
  }
  return chunks;
}

export function computeChunkChecksum(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fake Upload Transport
// ═══════════════════════════════════════════════════════════════════════════════

export type FakeScenario =
  | 'success' | 'partial_accept' | 'network_interrupt' | 'retryable_5xx'
  | 'rate_limit' | 'quota_exhausted' | 'invalid_range' | 'expired_session'
  | 'permanent_media_rejection' | 'unknown_after_accept' | 'duplicate_chunk'
  | 'finalization_delay' | 'cancellation';

export interface TransportResult {
  success: boolean;
  bytesAccepted?: number;
  retryable?: boolean;
  errorCode?: string;
  errorMessage?: string;
  retryAfterMs?: number;
  sessionExpired?: boolean;
  externalVideoId?: string;
}

export class FakeYouTubeUploadTransport {
  private scenario: FakeScenario = 'success';
  private callCount = 0;
  private sessionCreated = false;

  setScenario(s: FakeScenario) { this.scenario = s; }
  getCallCount() { return this.callCount; }
  reset() { this.callCount = 0; this.sessionCreated = false; }

  async createResumableSession(_projectId: string, _metadata: any): Promise<{ sessionReference: string; expiresAt: Date }> {
    this.callCount++;
    if (this.scenario === 'expired_session') throw new Error('Session creation failed: expired');
    if (this.scenario === 'permanent_media_rejection') throw new Error('Media rejected by platform');
    this.sessionCreated = true;
    return {
      sessionReference: `fake-session-${randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  async querySessionProgress(_sessionRef: string): Promise<{ uploadedBytes: number; status: string }> {
    this.callCount++;
    return { uploadedBytes: 0, status: 'active' };
  }

  async uploadChunk(_sessionRef: string, byteStart: number, byteEnd: number, _data: Buffer): Promise<TransportResult> {
    this.callCount++;
    const chunkSize = byteEnd - byteStart;

    switch (this.scenario) {
      case 'success': return { success: true, bytesAccepted: chunkSize };
      case 'partial_accept': return { success: true, bytesAccepted: Math.floor(chunkSize / 2) };
      case 'network_interrupt': return { success: false, retryable: true, errorCode: 'NETWORK_TRANSIENT', errorMessage: 'Connection reset' };
      case 'retryable_5xx': return { success: false, retryable: true, errorCode: 'PLATFORM_INTERNAL', errorMessage: '503 Service Unavailable' };
      case 'rate_limit': return { success: false, retryable: true, errorCode: 'RATE_LIMITED', retryAfterMs: 5000 };
      case 'quota_exhausted': return { success: false, retryable: false, errorCode: 'QUOTA_EXHAUSTED', errorMessage: 'Daily quota exceeded' };
      case 'invalid_range': return { success: false, retryable: false, errorCode: 'INVALID_RANGE', errorMessage: 'Range not satisfiable' };
      case 'expired_session': return { success: false, retryable: false, errorCode: 'SESSION_EXPIRED', sessionExpired: true };
      case 'permanent_media_rejection': return { success: false, retryable: false, errorCode: 'INVALID_MEDIA', errorMessage: 'Unsupported format' };
      case 'unknown_after_accept': return { success: true, bytesAccepted: chunkSize }; // success but ambiguous
      case 'duplicate_chunk': return { success: true, bytesAccepted: chunkSize }; // idempotent
      default: return { success: true, bytesAccepted: chunkSize };
    }
  }

  async finalizeUpload(_sessionRef: string): Promise<{ externalVideoId: string; status: string }> {
    this.callCount++;
    if (this.scenario === 'finalization_delay') {
      return { externalVideoId: `yt-video-${randomUUID().slice(0, 8)}`, status: 'processing' };
    }
    return { externalVideoId: `yt-video-${randomUUID().slice(0, 8)}`, status: 'uploaded' };
  }

  async abortSession(_sessionRef: string): Promise<{ aborted: boolean }> {
    this.callCount++;
    return { aborted: true };
  }

  async healthCheck(): Promise<boolean> { return true; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Upload Use Cases (in-memory, no DB in this module)
// ═══════════════════════════════════════════════════════════════════════════════

export interface StartUploadInput {
  projectId: string;
  publishingJobId: string;
  publishingAttemptId: string;
  platformAccountId: string;
  credentialBindingId: string;
  mediaSizeBytes: number;
  mediaChecksum: string;
  idempotencyKey: string;
  chunkSize?: number;
}

export class YouTubeUploadEngine {
  private sessions = new Map<string, YouTubeUploadSession>();
  private checkpoints = new Map<string, YouTubeUploadCheckpoint[]>();

  constructor(private transport: FakeYouTubeUploadTransport) {}

  async startUpload(input: StartUploadInput): Promise<YouTubeUploadSession> {
    // Idempotency: check existing
    for (const s of this.sessions.values()) {
      if (s.projectId === input.projectId && s.idempotencyKey === input.idempotencyKey) {
        if (s.publishingJobId !== input.publishingJobId) throw new Error('Idempotency conflict: different payload');
        return s; // replay
      }
    }

    if (input.mediaSizeBytes <= 0) throw new Error('Zero-byte media rejected');

    const { sessionReference, expiresAt } = await this.transport.createResumableSession(input.projectId, {});
    const chunkSize = input.chunkSize || DEFAULT_CHUNK_SIZE;

    const session: YouTubeUploadSession = {
      id: randomUUID(),
      projectId: input.projectId,
      publishingJobId: input.publishingJobId,
      publishingAttemptId: input.publishingAttemptId,
      platformAccountId: input.platformAccountId,
      credentialBindingId: input.credentialBindingId,
      uploadSessionSecretReference: `secret-ref:${sessionReference}`, // opaque
      totalBytes: input.mediaSizeBytes,
      uploadedBytes: 0,
      nextByteOffset: 0,
      chunkSize,
      mediaChecksum: input.mediaChecksum,
      status: 'ready',
      expiresAt,
      lastActivityAt: new Date(),
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.checkpoints.set(session.id, []);
    return session;
  }

  async uploadNextChunk(sessionId: string, projectId: string, chunkData: Buffer): Promise<{ accepted: boolean; bytesAccepted: number; retryable?: boolean; errorCode?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.projectId !== projectId) throw new Error('Cross-project denied');
    if (session.status === 'cancelled') throw new Error('Session cancelled');
    if (session.status === 'uploaded') throw new Error('Already completed');
    if (session.status === 'failed') throw new Error('Session failed');

    session.status = 'uploading';
    const byteStart = session.nextByteOffset;
    const byteEnd = byteStart + chunkData.length;

    // Create checkpoint
    const checkpoint: YouTubeUploadCheckpoint = {
      id: randomUUID(),
      projectId,
      uploadSessionId: sessionId,
      byteStart,
      byteEnd,
      bytesAccepted: 0,
      chunkChecksum: computeChunkChecksum(chunkData),
      transportRequestId: randomUUID(),
      status: 'sending',
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.checkpoints.get(sessionId)!.push(checkpoint);

    // Call transport
    const result = await this.transport.uploadChunk('fake-ref', byteStart, byteEnd, chunkData);

    if (result.success && result.bytesAccepted) {
      checkpoint.status = 'accepted';
      checkpoint.bytesAccepted = result.bytesAccepted;
      session.uploadedBytes += result.bytesAccepted;
      session.nextByteOffset += result.bytesAccepted;
      session.lastActivityAt = new Date();

      // Check completion
      if (session.uploadedBytes >= session.totalBytes) {
        session.status = 'completing';
      }
      return { accepted: true, bytesAccepted: result.bytesAccepted };
    } else {
      checkpoint.status = result.retryable ? 'retryable_failed' : 'permanent_failed';
      if (!result.retryable) {
        session.status = 'failed';
      } else {
        session.status = 'interrupted';
      }
      return { accepted: false, bytesAccepted: 0, retryable: result.retryable, errorCode: result.errorCode };
    }
  }

  async finalizeUpload(sessionId: string, projectId: string): Promise<{ externalVideoId: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.projectId !== projectId) throw new Error('Cross-project denied');
    if (session.status !== 'completing') throw new Error('Not ready for finalization');

    const result = await this.transport.finalizeUpload('fake-ref');
    session.status = 'uploaded';
    return { externalVideoId: result.externalVideoId };
  }

  async cancelSession(sessionId: string, projectId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.projectId !== projectId) throw new Error('Cross-project denied');
    if (session.status === 'cancelled') return true; // idempotent
    if (session.status === 'uploaded') throw new Error('Cannot cancel completed upload');

    await this.transport.abortSession('fake-ref');
    session.status = 'cancelled';
    return true;
  }

  // Accessors for testing
  getSession(id: string) { return this.sessions.get(id); }
  getCheckpoints(sessionId: string) { return this.checkpoints.get(sessionId) || []; }
  getAllSessions() { return Array.from(this.sessions.values()); }
}
