/**
 * YouTube OAuth Domain Model
 * AIDILAM-DEP-016A2
 *
 * Implements fail-closed authorization state lifecycle,
 * secret-reference boundary, and credential binding.
 */
import { randomBytes, createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// Status Types
// ═══════════════════════════════════════════════════════════════════════════════

export type AuthorizationSessionStatus =
  | 'created'
  | 'redirect_ready'
  | 'callback_received'
  | 'token_exchange_pending'
  | 'authorized'
  | 'expired'
  | 'rejected'
  | 'failed'
  | 'consumed';

export type CredentialBindingStatus =
  | 'pending'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'reauthorization_required'
  | 'disabled';

// ═══════════════════════════════════════════════════════════════════════════════
// Entity Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface YouTubeOAuthClientConfig {
  id: string;
  projectId: string;
  displayName: string;
  clientIdReference: string;       // public, safe to log
  clientSecretReference: string;   // vault reference, never raw
  redirectUri: string | null;      // fail-closed if absent
  audience: 'internal' | 'external';
  publishingStatus: 'testing' | 'published';
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface YouTubeAuthorizationSession {
  id: string;
  projectId: string;
  platformAccountId: string;
  stateHash: string;               // SHA-256 of random state (never store raw)
  pkceVerifierReference: string | null; // vault reference if PKCE used
  redirectUri: string;
  requestedScopes: string[];
  status: AuthorizationSessionStatus;
  expiresAt: Date;
  usedAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export interface YouTubeCredentialBinding {
  id: string;
  projectId: string;
  platformAccountId: string;
  googleSubjectHash: string;       // hashed, not raw
  channelId: string;               // public identifier
  channelTitle: string;
  credentialReference: string;     // vault reference to refresh token
  scopeSet: string[];
  authorizedAt: Date;
  expiresOrRevokedAt: Date | null;
  status: CredentialBindingStatus;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Security Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate cryptographically random OAuth state (32 bytes, hex) */
export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

/** Hash OAuth state for storage (never store raw state) */
export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

/** Generate PKCE code verifier (43-128 chars, URL-safe) */
export function generatePKCEVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/** Generate PKCE code challenge from verifier */
export function generatePKCEChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Hash Google subject ID for storage */
export function hashGoogleSubject(sub: string): string {
  return createHash('sha256').update(`yt:${sub}`).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════════

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
] as const;

export function validateScopes(scopes: string[]): boolean {
  return scopes.every(s => (YOUTUBE_SCOPES as readonly string[]).includes(s));
}

export function validateRedirectUri(uri: string | null, allowlist: string[]): boolean {
  if (!uri) return false;
  return allowlist.includes(uri);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session Transitions
// ═══════════════════════════════════════════════════════════════════════════════

const SESSION_TRANSITIONS: Record<AuthorizationSessionStatus, AuthorizationSessionStatus[]> = {
  created: ['redirect_ready', 'expired', 'failed'],
  redirect_ready: ['callback_received', 'expired', 'failed'],
  callback_received: ['token_exchange_pending', 'rejected', 'failed'],
  token_exchange_pending: ['authorized', 'failed'],
  authorized: ['consumed'],
  expired: [],
  rejected: [],
  failed: [],
  consumed: [],
};

export function canTransitionSession(from: AuthorizationSessionStatus, to: AuthorizationSessionStatus): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

const BINDING_TRANSITIONS: Record<CredentialBindingStatus, CredentialBindingStatus[]> = {
  pending: ['active', 'expired', 'disabled'],
  active: ['expired', 'revoked', 'reauthorization_required', 'disabled'],
  expired: ['active', 'revoked', 'disabled'],
  revoked: ['disabled'],
  reauthorization_required: ['active', 'revoked', 'disabled'],
  disabled: [],
};

export function canTransitionBinding(from: CredentialBindingStatus, to: CredentialBindingStatus): boolean {
  return BINDING_TRANSITIONS[from]?.includes(to) ?? false;
}
