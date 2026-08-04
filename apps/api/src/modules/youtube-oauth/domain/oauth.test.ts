/**
 * YouTube OAuth Foundation Tests
 * AIDILAM-DEP-016A2R
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateOAuthState, hashOAuthState, generatePKCEVerifier,
  generatePKCEChallenge, hashGoogleSubject, validateRedirectUri,
  canTransitionSession, canTransitionBinding,
} from './model.js';
import { FakeSecretStore, generateSecretReference } from '../infrastructure/secret-store.js';
import { YouTubeOAuthService, FakeGoogleOAuthTransport } from './oauth-service.js';

describe('YouTube OAuth Domain Model', () => {
  it('generates cryptographically random state (32 bytes hex)', () => {
    const s1 = generateOAuthState();
    const s2 = generateOAuthState();
    expect(s1).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(s2).toHaveLength(64);
    expect(s1).not.toBe(s2); // random
  });

  it('stores only state hash, not raw state', () => {
    const raw = generateOAuthState();
    const hash = hashOAuthState(raw);
    expect(hash).toHaveLength(64); // SHA-256 = 64 hex
    expect(hash).not.toBe(raw);
    // Same input = same hash
    expect(hashOAuthState(raw)).toBe(hash);
  });

  it('PKCE verifier/challenge relationship is valid', () => {
    const verifier = generatePKCEVerifier();
    const challenge = generatePKCEChallenge(verifier);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge.length).toBeGreaterThan(0);
    // Different verifier = different challenge
    const v2 = generatePKCEVerifier();
    expect(generatePKCEChallenge(v2)).not.toBe(challenge);
  });

  it('validates redirect URI against allowlist', () => {
    expect(validateRedirectUri('https://app.aidilam.com/callback', ['https://app.aidilam.com/callback'])).toBe(true);
    expect(validateRedirectUri('https://evil.com/callback', ['https://app.aidilam.com/callback'])).toBe(false);
    expect(validateRedirectUri(null, ['https://app.aidilam.com/callback'])).toBe(false);
    expect(validateRedirectUri('https://app.aidilam.com/callback', [])).toBe(false);
  });

  it('session transitions are governed', () => {
    expect(canTransitionSession('created', 'redirect_ready')).toBe(true);
    expect(canTransitionSession('redirect_ready', 'callback_received')).toBe(true);
    expect(canTransitionSession('authorized', 'redirect_ready')).toBe(false);
    expect(canTransitionSession('expired', 'authorized')).toBe(false);
    expect(canTransitionSession('consumed', 'authorized')).toBe(false);
  });

  it('binding transitions are governed', () => {
    expect(canTransitionBinding('active', 'revoked')).toBe(true);
    expect(canTransitionBinding('revoked', 'active')).toBe(false);
    expect(canTransitionBinding('disabled', 'active')).toBe(false);
  });
});

describe('FakeSecretStore', () => {
  let store: FakeSecretStore;
  beforeEach(() => { store = new FakeSecretStore(); });

  it('stores and retrieves secrets', async () => {
    await store.putSecret('ref-1', 'value-1');
    expect(await store.getSecret('ref-1')).toBe('value-1');
  });

  it('returns null for missing reference', async () => {
    expect(await store.getSecret('nonexistent')).toBeNull();
  });

  it('fails closed when unavailable', async () => {
    store.setUnavailable();
    await expect(store.putSecret('x', 'y')).rejects.toThrow('unavailable');
    await expect(store.getSecret('x')).rejects.toThrow('unavailable');
  });

  it('health check reflects availability', async () => {
    expect(await store.healthCheck()).toBe(true);
    store.setUnavailable();
    expect(await store.healthCheck()).toBe(false);
  });

  it('generates opaque non-reversible references', () => {
    const ref = generateSecretReference('test');
    expect(ref).toMatch(/^test:[0-9a-f]{32}$/);
  });
});

describe('YouTubeOAuthService', () => {
  let service: YouTubeOAuthService;
  let secretStore: FakeSecretStore;
  const REDIRECT = 'https://app.aidilam.com/oauth/callback';

  beforeEach(() => {
    secretStore = new FakeSecretStore();
    service = new YouTubeOAuthService(secretStore, new FakeGoogleOAuthTransport(), [REDIRECT]);
  });

  it('creates valid authorization session', async () => {
    const { session, authorizationUrl, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    expect(session.status).toBe('redirect_ready');
    expect(session.stateHash).toHaveLength(64);
    expect(session.stateHash).not.toBe(rawState); // hash, not raw
    expect(authorizationUrl).toContain('accounts.google.com');
    expect(authorizationUrl).toContain('code_challenge');
  });

  it('rejects absent redirect URI (fail-closed)', async () => {
    const svc = new YouTubeOAuthService(secretStore, new FakeGoogleOAuthTransport(), []);
    await expect(svc.createAuthorizationSession({
      projectId: 'p', platformAccountId: 'a',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'u',
    })).rejects.toThrow('not in allowlist');
  });

  it('rejects mismatched redirect URI', async () => {
    await expect(service.createAuthorizationSession({
      projectId: 'p', platformAccountId: 'a',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: 'https://evil.com/callback', createdBy: 'u',
    })).rejects.toThrow('not in allowlist');
  });

  it('fails closed when secret store unavailable', async () => {
    secretStore.setUnavailable();
    await expect(service.createAuthorizationSession({
      projectId: 'p', platformAccountId: 'a',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'u',
    })).rejects.toThrow('unavailable');
  });

  it('accepts valid callback and creates binding', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    const binding = await service.acceptCallback({
      sessionId: session.id, projectId: 'proj-1', state: rawState, code: 'auth-code-123',
    });
    expect(binding.status).toBe('active');
    expect(binding.channelId).toBe('UC_fake_channel');
    expect(binding.credentialReference).toMatch(/^yt-refresh:/);
    // Session consumed
    expect(service.getSession(session.id)!.status).toBe('consumed');
  });

  it('rejects wrong state (CSRF protection)', async () => {
    const { session } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    await expect(service.acceptCallback({
      sessionId: session.id, projectId: 'proj-1', state: 'wrong-state', code: 'code',
    })).rejects.toThrow('State mismatch');
  });

  it('rejects wrong project (cross-project isolation)', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    await expect(service.acceptCallback({
      sessionId: session.id, projectId: 'proj-OTHER', state: rawState, code: 'code',
    })).rejects.toThrow('Project mismatch');
  });

  it('rejects consumed session (replay protection)', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    await service.acceptCallback({ sessionId: session.id, projectId: 'proj-1', state: rawState, code: 'code' });
    await expect(service.acceptCallback({
      sessionId: session.id, projectId: 'proj-1', state: rawState, code: 'code',
    })).rejects.toThrow('not in redirect_ready');
  });

  it('rejects expired session', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    // Force expiry
    session.expiresAt = new Date(Date.now() - 1000);
    await expect(service.acceptCallback({
      sessionId: session.id, projectId: 'proj-1', state: rawState, code: 'code',
    })).rejects.toThrow('expired');
  });

  it('revokes binding and blocks subsequent use', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    const binding = await service.acceptCallback({ sessionId: session.id, projectId: 'proj-1', state: rawState, code: 'c' });
    await service.revokeBinding(binding.id, 'proj-1');
    expect(service.getBinding(binding.id)!.status).toBe('revoked');
    const validation = await service.validateBinding(binding.id, 'proj-1');
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('status_revoked');
  });

  it('cross-project revocation rejected', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    const binding = await service.acceptCallback({ sessionId: session.id, projectId: 'proj-1', state: rawState, code: 'c' });
    await expect(service.revokeBinding(binding.id, 'proj-OTHER')).rejects.toThrow('Project mismatch');
  });

  it('no raw token persisted in binding', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-1', platformAccountId: 'acct-1',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-1',
    });
    const binding = await service.acceptCallback({ sessionId: session.id, projectId: 'proj-1', state: rawState, code: 'c' });
    // Binding contains only reference, never raw token
    expect(binding.credentialReference).toMatch(/^yt-refresh:/);
    expect(JSON.stringify(binding)).not.toContain('fake-refresh-token');
    expect(JSON.stringify(binding)).not.toContain('fake-access-token');
  });
});
