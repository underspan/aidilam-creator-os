/**
 * Browser Session Authentication Service
 * AIDILAM-VIDEOMVP-004R3
 *
 * Server-side sessions with HttpOnly cookies. No token in browser JS.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { Pool } from 'pg';

// ═══════════════════════════════════════════════════════════════════════════════
// Password Hashing (scrypt - Node built-in, no external dep)
// ═══════════════════════════════════════════════════════════════════════════════

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts[0] !== 'scrypt' || parts.length !== 3) return false;
  const salt = parts[1];
  const expectedHash = Buffer.from(parts[2], 'hex');
  const actualHash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return timingSafeEqual(expectedHash, actualHash);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session Management
// ═══════════════════════════════════════════════════════════════════════════════

const SESSION_IDLE_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

export function generateCsrfToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashCsrfToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionRecord {
  id: string;
  userId: string;
  csrfTokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  revokedAt: Date | null;
  authMethod: string;
}

export class BrowserSessionService {
  constructor(private pool: Pool) {}

  async createSession(userId: string, sourceIp?: string, userAgent?: string): Promise<{ sessionId: string; csrfToken: string; expiresAt: Date }> {
    const sessionId = generateSessionId();
    const sessionHash = hashSessionId(sessionId);
    const csrfToken = generateCsrfToken();
    const csrfHash = hashCsrfToken(csrfToken);
    const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);

    await this.pool.query(
      `INSERT INTO aidilam_app.browser_sessions (session_hash, user_id, csrf_token_hash, expires_at, source_ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionHash, userId, csrfHash, expiresAt, sourceIp || null, userAgent || null]
    );

    return { sessionId, csrfToken, expiresAt };
  }

  async validateSession(sessionId: string): Promise<SessionRecord | null> {
    const sessionHash = hashSessionId(sessionId);
    const result = await this.pool.query(
      `SELECT id, user_id, csrf_token_hash, auth_method, issued_at, expires_at, last_activity_at, revoked_at
       FROM aidilam_app.browser_sessions
       WHERE session_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [sessionHash]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Check idle timeout
    const lastActivity = new Date(row.last_activity_at);
    if (Date.now() - lastActivity.getTime() > SESSION_IDLE_MS) {
      await this.revokeSession(sessionId);
      return null;
    }

    // Update last activity
    await this.pool.query(
      `UPDATE aidilam_app.browser_sessions SET last_activity_at = now() WHERE session_hash = $1`,
      [sessionHash]
    );

    return {
      id: row.id,
      userId: row.user_id,
      csrfTokenHash: row.csrf_token_hash,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      lastActivityAt: row.last_activity_at,
      revokedAt: row.revoked_at,
      authMethod: row.auth_method,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    const sessionHash = hashSessionId(sessionId);
    await this.pool.query(
      `UPDATE aidilam_app.browser_sessions SET revoked_at = now() WHERE session_hash = $1`,
      [sessionHash]
    );
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE aidilam_app.browser_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }

  verifyCsrf(token: string, expectedHash: string): boolean {
    const actualHash = hashCsrfToken(token);
    return actualHash === expectedHash;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// User Authentication
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

export async function authenticateUser(pool: Pool, email: string, password: string): Promise<AuthResult> {
  const result = await pool.query(
    `SELECT id, password_hash, status, force_password_reset FROM aidilam_app.users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  if (result.rows.length === 0) {
    // Timing-safe: still hash to prevent enumeration
    hashPassword('dummy-timing-safe');
    return { success: false, error: 'invalid_credentials' };
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    return { success: false, error: 'user_disabled' };
  }

  if (!user.password_hash) {
    return { success: false, error: 'no_password_configured' };
  }

  if (!verifyPassword(password, user.password_hash)) {
    return { success: false, error: 'invalid_credentials' };
  }

  // Update last login
  await pool.query(`UPDATE aidilam_app.users SET last_login_at = now() WHERE id = $1`, [user.id]);

  return { success: true, userId: user.id };
}
