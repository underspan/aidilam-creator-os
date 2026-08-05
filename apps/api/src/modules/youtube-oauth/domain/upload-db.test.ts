/**
 * DEP-016A4R Integration Tests Part 1: DB Repositories and Migration
 *
 * Tests DB-backed persistence, idempotency, monotonicity, isolation.
 * Uses live DEV database (aidilam_runtime user).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { UploadSessionRepository, UploadCheckpointRepository } from '../infrastructure/upload-repositories.js';

// Test-scoped pool (connects to DEV DB same as runtime)
let pool: Pool;
let sessionRepo: UploadSessionRepository;
let checkpointRepo: UploadCheckpointRepository;

// Test fixtures
const TEST_PROJECT_ID = randomUUID();
const TEST_BINDING_ID = randomUUID();
const FOREIGN_PROJECT_ID = randomUUID();

beforeAll(async () => {
  pool = new Pool({
    host: process.env.POSTGRES_HOST || 'aidilam-postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'aidilam',
    user: process.env.POSTGRES_USER || 'aidilam_runtime',
    password: process.env.POSTGRES_PASSWORD || '',
  });
  sessionRepo = new UploadSessionRepository(pool);
  checkpointRepo = new UploadCheckpointRepository(pool);

  // Create test project and credential binding fixtures
  await pool.query(
    `INSERT INTO aidilam_app.projects (id, code, name, status) VALUES ($1, $2, 'A4R-test-project', 'active') ON CONFLICT (id) DO NOTHING`,
    [TEST_PROJECT_ID, `a4r-test-${TEST_PROJECT_ID.slice(0, 8)}`]
  );
  await pool.query(
    `INSERT INTO aidilam_app.projects (id, code, name, status) VALUES ($1, $2, 'A4R-foreign-project', 'active') ON CONFLICT (id) DO NOTHING`,
    [FOREIGN_PROJECT_ID, `a4r-foreign-${FOREIGN_PROJECT_ID.slice(0, 8)}`]
  );
  // Need a platform account for the binding
  // Need a youtube_oauth_client for the binding's FK chain
  await pool.query(
    `INSERT INTO aidilam_app.youtube_oauth_clients (id, project_id, display_name, client_id_reference, client_secret_reference)
     VALUES ($1, $2, 'test-client', 'ref:test-client-id', 'ref:test-client-secret') ON CONFLICT DO NOTHING`,
    [randomUUID(), TEST_PROJECT_ID]
  );
  // Create a credential binding with required foreign keys
  const testPlatformAccountId = randomUUID();
  await pool.query(
    `INSERT INTO aidilam_app.youtube_credential_bindings (id, project_id, platform_account_id, google_subject_hash, channel_id, channel_title, credential_reference, scope_set, status)
     VALUES ($1, $2, $3, 'hash-test', 'UC_test', 'Test Channel', 'ref:test-cred', ARRAY['youtube.upload'], 'active')
     ON CONFLICT (project_id, platform_account_id) DO NOTHING`,
    [TEST_BINDING_ID, TEST_PROJECT_ID, testPlatformAccountId]
  );
});

afterAll(async () => {
  // Cleanup synthetic rows
  await pool.query(`DELETE FROM aidilam_app.youtube_upload_checkpoints WHERE project_id IN ($1, $2)`, [TEST_PROJECT_ID, FOREIGN_PROJECT_ID]);
  await pool.query(`DELETE FROM aidilam_app.youtube_upload_sessions WHERE project_id IN ($1, $2)`, [TEST_PROJECT_ID, FOREIGN_PROJECT_ID]);
  await pool.query(`DELETE FROM aidilam_app.youtube_credential_bindings WHERE project_id = $1`, [TEST_PROJECT_ID]);
  await pool.query(`DELETE FROM aidilam_app.youtube_oauth_clients WHERE project_id = $1`, [TEST_PROJECT_ID]);
  await pool.query(`DELETE FROM aidilam_app.projects WHERE id IN ($1, $2)`, [TEST_PROJECT_ID, FOREIGN_PROJECT_ID]);
  await pool.end();
});

describe('A4R.1 Migration Verification', () => {
  it('1. youtube_upload_sessions table exists', async () => {
    const result = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='aidilam_app' AND table_name='youtube_upload_sessions'`
    );
    expect(result.rows).toHaveLength(1);
  });

  it('2. youtube_upload_checkpoints table exists', async () => {
    const result = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='aidilam_app' AND table_name='youtube_upload_checkpoints'`
    );
    expect(result.rows).toHaveLength(1);
  });

  it('3. indexes exist', async () => {
    const result = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname='aidilam_app' AND tablename LIKE 'youtube_upload%'`
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(9);
  });

  it('4. no raw-secret columns', async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='aidilam_app' AND table_name LIKE 'youtube_upload%'
       AND (column_name LIKE '%token%' OR column_name LIKE '%uri%' OR column_name LIKE '%bearer%')`
    );
    expect(result.rows).toHaveLength(0);
  });
});

describe('A4R.2 Session Repository', () => {
  const idemKey = `test-idem-${randomUUID().slice(0, 8)}`;

  it('5. createIdempotently creates a session', async () => {
    const result = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-session-001',
      totalBytes: 10 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-test-abc',
      idempotencyKey: idemKey,
      expiresAt: new Date(Date.now() + 86400000),
    });
    expect(result.created).toBe(true);
    expect(result.id).toBeDefined();
  });

  it('6. same idempotency key returns existing (replay)', async () => {
    const jobId = randomUUID();
    const key = `idem-replay-${randomUUID().slice(0, 8)}`;
    const first = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: jobId,
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-002',
      totalBytes: 5 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-replay',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const second = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: jobId,
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-002b',
      totalBytes: 5 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-replay',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it('7. different payload same key throws conflict', async () => {
    const key = `idem-conflict-${randomUUID().slice(0, 8)}`;
    await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-003',
      totalBytes: 5 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-conflict',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    await expect(sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(), // different job
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-003b',
      totalBytes: 5 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-conflict',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    })).rejects.toThrow('Idempotency conflict');
  });

  it('8. findByProjectAndId returns correct session', async () => {
    const key = `idem-find-${randomUUID().slice(0, 8)}`;
    const created = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-find',
      totalBytes: 3 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-find',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const found = await sessionRepo.findByProjectAndId(TEST_PROJECT_ID, created.id);
    expect(found).not.toBeNull();
    expect(found.upload_session_secret_reference).toBe('secret-ref:fake-find');
  });

  it('9. cross-project findByProjectAndId returns null', async () => {
    const key = `idem-cross-${randomUUID().slice(0, 8)}`;
    const created = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-cross',
      totalBytes: 2 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-cross',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const notFound = await sessionRepo.findByProjectAndId(FOREIGN_PROJECT_ID, created.id);
    expect(notFound).toBeNull();
  });

  it('10. updateProgressAtomically advances monotonically', async () => {
    const key = `idem-progress-${randomUUID().slice(0, 8)}`;
    const created = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-progress',
      totalBytes: 3 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-progress',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const r1 = await sessionRepo.updateProgressAtomically(TEST_PROJECT_ID, created.id, 1024 * 1024);
    expect(r1).not.toBeNull();
    expect(Number(r1.uploaded_bytes)).toBe(1024 * 1024);

    const r2 = await sessionRepo.updateProgressAtomically(TEST_PROJECT_ID, created.id, 1024 * 1024);
    expect(Number(r2.uploaded_bytes)).toBe(2 * 1024 * 1024);
    expect(Number(r2.uploaded_bytes)).toBeGreaterThan(Number(r1.uploaded_bytes));
  });

  it('11. updateProgressAtomically rejects overflow', async () => {
    const key = `idem-overflow-${randomUUID().slice(0, 8)}`;
    const created = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-overflow',
      totalBytes: 1024 * 1024,
      chunkSize: 512 * 1024,
      mediaChecksum: 'sha256-overflow',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    // Try to advance beyond total
    const result = await sessionRepo.updateProgressAtomically(TEST_PROJECT_ID, created.id, 2 * 1024 * 1024);
    expect(result).toBeNull(); // rejected
  });

  it('12. cancel transitions to cancelled', async () => {
    const key = `idem-cancel-${randomUUID().slice(0, 8)}`;
    const created = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-cancel',
      totalBytes: 5 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-cancel',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const cancelled = await sessionRepo.cancel(TEST_PROJECT_ID, created.id);
    expect(cancelled).toBe(true);
    const session = await sessionRepo.findByProjectAndId(TEST_PROJECT_ID, created.id);
    expect(session.status).toBe('cancelled');
  });

  it('13. cancel on foreign project returns false', async () => {
    const key = `idem-fcancel-${randomUUID().slice(0, 8)}`;
    const created = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-fcancel',
      totalBytes: 5 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-fcancel',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const cancelled = await sessionRepo.cancel(FOREIGN_PROJECT_ID, created.id);
    expect(cancelled).toBe(false);
  });
});

describe('A4R.3 Checkpoint Repository', () => {
  let testSessionId: string;

  beforeAll(async () => {
    const key = `idem-cp-${randomUUID().slice(0, 8)}`;
    const session = await sessionRepo.createIdempotently(TEST_PROJECT_ID, {
      publishingJobId: randomUUID(),
      publishingAttemptId: randomUUID(),
      platformAccountId: randomUUID(),
      credentialBindingId: TEST_BINDING_ID,
      uploadSessionSecretReference: 'secret-ref:fake-cp-session',
      totalBytes: 3 * 1024 * 1024,
      chunkSize: 1024 * 1024,
      mediaChecksum: 'sha256-cp',
      idempotencyKey: key,
      expiresAt: new Date(Date.now() + 86400000),
    });
    testSessionId = session.id;
  });

  it('14. createPending creates checkpoint', async () => {
    const cp = await checkpointRepo.createPending(TEST_PROJECT_ID, {
      uploadSessionId: testSessionId,
      byteStart: 0,
      byteEnd: 1024 * 1024,
      chunkChecksum: 'abc123',
      transportRequestId: randomUUID(),
    });
    expect(cp.id).toBeDefined();
  });

  it('15. markAccepted transitions and records bytes', async () => {
    const cp = await checkpointRepo.createPending(TEST_PROJECT_ID, {
      uploadSessionId: testSessionId,
      byteStart: 1024 * 1024,
      byteEnd: 2 * 1024 * 1024,
      chunkChecksum: 'def456',
      transportRequestId: randomUUID(),
    });
    await checkpointRepo.markSending(TEST_PROJECT_ID, cp.id);
    const accepted = await checkpointRepo.markAccepted(TEST_PROJECT_ID, cp.id, 1024 * 1024);
    expect(accepted).not.toBeNull();
    expect(Number(accepted.bytes_accepted)).toBe(1024 * 1024);
  });

  it('16. listOrdered returns checkpoints in byte order', async () => {
    const list = await checkpointRepo.listOrdered(TEST_PROJECT_ID, testSessionId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < list.length; i++) {
      expect(Number(list[i].byte_start)).toBeGreaterThanOrEqual(Number(list[i - 1].byte_start));
    }
  });

  it('17. findLastAccepted returns correct checkpoint', async () => {
    const last = await checkpointRepo.findLastAccepted(TEST_PROJECT_ID, testSessionId);
    expect(last).not.toBeNull();
    expect(last.status).toBe('accepted');
  });

  it('18. markRetryableFailed increments retry_count', async () => {
    const cp = await checkpointRepo.createPending(TEST_PROJECT_ID, {
      uploadSessionId: testSessionId,
      byteStart: 2 * 1024 * 1024,
      byteEnd: 3 * 1024 * 1024,
      chunkChecksum: 'ghi789',
      transportRequestId: randomUUID(),
    });
    await checkpointRepo.markSending(TEST_PROJECT_ID, cp.id);
    const failed = await checkpointRepo.markRetryableFailed(TEST_PROJECT_ID, cp.id);
    expect(failed).not.toBeNull();
    expect(failed.retry_count).toBe(1);
  });
});
