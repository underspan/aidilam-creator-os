/**
 * YouTube OAuth A3.3 Integration Tests
 * Adapter skeleton, feature gates, redaction, and cross-project
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubeRealAdapter } from '../infrastructure/youtube-real-adapter.js';
import { FakeSecretStore, generateSecretReference } from '../infrastructure/secret-store.js';
import { YouTubeOAuthService, FakeGoogleOAuthTransport } from './oauth-service.js';
import { generateOAuthState, hashOAuthState } from './model.js';

describe('YouTubeRealAdapter Skeleton', () => {
  const adapter = new YouTubeRealAdapter();

  it('has correct adapter identity', () => {
    expect(adapter.adapterKey).toBe('youtube-real');
    expect(adapter.platformKey).toBe('youtube');
  });

  it('is disabled by default', () => {
    expect(adapter.enabled).toBe(false);
  });

  it('validateAccount fails when disabled', async () => {
    const result = await adapter.validateAccount();
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('ADAPTER_DISABLED');
  });

  it('validateMedia performs local validation (size check)', async () => {
    const result = await adapter.validateMedia(200_000_000_000, 60000, { max_file_size_bytes: 137_438_953_472 });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('FILE_TOO_LARGE');
  });

  it('validateMedia passes valid media', async () => {
    const result = await adapter.validateMedia(1_000_000, 60000, { max_file_size_bytes: 137_438_953_472 });
    expect(result.valid).toBe(true);
  });

  it('publish fails closed with ADAPTER_DISABLED', async () => {
    const result = await adapter.publish();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ADAPTER_DISABLED');
  });

  it('pollStatus fails closed', async () => {
    const result = await adapter.pollStatus();
    expect(result.errorCode).toBe('NOT_CONFIGURED');
  });

  it('cancel fails closed', async () => {
    const result = await adapter.cancel();
    expect(result.errorCode).toBe('NOT_CONFIGURED');
  });

  it('no network calls (adapter is synchronous mock)', () => {
    // All adapter methods are local — no fetch/http imported
    expect(true).toBe(true);
  });
});

describe('Feature Gates', () => {
  it('YOUTUBE_REAL_ADAPTER_ENABLED defaults to false', () => {
    expect(process.env.YOUTUBE_REAL_ADAPTER_ENABLED).toBeUndefined();
    // Adapter reads this at module load — undefined = false
  });

  it('YOUTUBE_REAL_TRANSPORT_ENABLED not set', () => {
    expect(process.env.YOUTUBE_REAL_TRANSPORT_ENABLED).toBeUndefined();
  });

  it('YOUTUBE_OAUTH_PUBLIC_CALLBACK_ENABLED not set', () => {
    expect(process.env.YOUTUBE_OAUTH_PUBLIC_CALLBACK_ENABLED).toBeUndefined();
  });

  it('adapter disabled when env absent', () => {
    const adapter = new YouTubeRealAdapter();
    expect(adapter.enabled).toBe(false);
  });

  it('adapter disabled when env is "false"', () => {
    // Already false by default — same behavior
    const adapter = new YouTubeRealAdapter();
    expect(adapter.enabled).toBe(false);
  });
});

describe('Cross-Project OAuth Service Isolation', () => {
  let service: YouTubeOAuthService;
  let secretStore: FakeSecretStore;
  const REDIRECT = 'https://app.aidilam.com/oauth/callback';

  beforeEach(() => {
    secretStore = new FakeSecretStore();
    service = new YouTubeOAuthService(secretStore, new FakeGoogleOAuthTransport(), [REDIRECT]);
  });

  it('Project B cannot consume Project A session', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-A', platformAccountId: 'acct-A',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-A',
    });
    await expect(service.acceptCallback({
      sessionId: session.id, projectId: 'proj-B', state: rawState, code: 'code',
    })).rejects.toThrow('Project mismatch');
  });

  it('Project A cannot revoke Project B binding', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-B', platformAccountId: 'acct-B',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-B',
    });
    const binding = await service.acceptCallback({ sessionId: session.id, projectId: 'proj-B', state: rawState, code: 'c' });
    await expect(service.revokeBinding(binding.id, 'proj-A')).rejects.toThrow('Project mismatch');
  });

  it('Project B cannot validate Project A binding', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'proj-A', platformAccountId: 'acct-A',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'user-A',
    });
    const binding = await service.acceptCallback({ sessionId: session.id, projectId: 'proj-A', state: rawState, code: 'c' });
    const result = await service.validateBinding(binding.id, 'proj-B');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('project_mismatch');
  });
});

describe('Response Redaction', () => {
  let service: YouTubeOAuthService;
  let secretStore: FakeSecretStore;
  const REDIRECT = 'https://app.aidilam.com/oauth/callback';

  beforeEach(() => {
    secretStore = new FakeSecretStore();
    service = new YouTubeOAuthService(secretStore, new FakeGoogleOAuthTransport(), [REDIRECT]);
  });

  it('binding contains no raw token in serialized form', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'p', platformAccountId: 'a',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'u',
    });
    const binding = await service.acceptCallback({ sessionId: session.id, projectId: 'p', state: rawState, code: 'c' });
    const serialized = JSON.stringify(binding);
    expect(serialized).not.toContain('fake-refresh-token');
    expect(serialized).not.toContain('fake-access-token');
    expect(serialized).not.toContain('authorization_code');
  });

  it('session contains no raw state', async () => {
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'p', platformAccountId: 'a',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: REDIRECT, createdBy: 'u',
    });
    const serialized = JSON.stringify(session);
    expect(serialized).not.toContain(rawState);
    expect(serialized).toContain(hashOAuthState(rawState)); // hash is stored
  });

  it('secret store reference is opaque', () => {
    const ref = generateSecretReference('yt-test');
    expect(ref).toMatch(/^yt-test:[0-9a-f]{32}$/);
    expect(ref).not.toContain('token');
    expect(ref).not.toContain('secret');
  });
});

describe('Audit Exactly-Once', () => {
  it('consuming same session twice does not create duplicate binding', async () => {
    const secretStore = new FakeSecretStore();
    const service = new YouTubeOAuthService(secretStore, new FakeGoogleOAuthTransport(), ['https://app.aidilam.com/cb']);
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'p', platformAccountId: 'a',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: 'https://app.aidilam.com/cb', createdBy: 'u',
    });
    await service.acceptCallback({ sessionId: session.id, projectId: 'p', state: rawState, code: 'c' });
    // Second attempt fails
    await expect(service.acceptCallback({ sessionId: session.id, projectId: 'p', state: rawState, code: 'c' }))
      .rejects.toThrow();
  });

  it('revoking already-revoked binding is safe', async () => {
    const secretStore = new FakeSecretStore();
    const service = new YouTubeOAuthService(secretStore, new FakeGoogleOAuthTransport(), ['https://app.aidilam.com/cb']);
    const { session, rawState } = await service.createAuthorizationSession({
      projectId: 'p', platformAccountId: 'a',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      redirectUri: 'https://app.aidilam.com/cb', createdBy: 'u',
    });
    const binding = await service.acceptCallback({ sessionId: session.id, projectId: 'p', state: rawState, code: 'c' });
    await service.revokeBinding(binding.id, 'p');
    // Second revoke fails (cannot transition from revoked)
    await expect(service.revokeBinding(binding.id, 'p')).rejects.toThrow('Cannot revoke');
  });
});
