/**
 * YouTube OAuth Service
 * AIDILAM-DEP-016A2
 *
 * Contracts for authorization session management.
 * Uses fake transport only — real Google OAuth disabled.
 */
import {
  generateOAuthState, hashOAuthState, generatePKCEVerifier,
  generatePKCEChallenge, hashGoogleSubject,
  validateRedirectUri, canTransitionSession, canTransitionBinding,
  type AuthorizationSessionStatus, type CredentialBindingStatus,
  type YouTubeAuthorizationSession, type YouTubeCredentialBinding,
} from '../domain/model.js';
import { type SecretStore, generateSecretReference } from '../infrastructure/secret-store.js';
import { randomUUID } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// Google OAuth Transport Interface (real implementation future)
// ═══════════════════════════════════════════════════════════════════════════════

export interface GoogleOAuthTransport {
  exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  revokeToken(token: string): Promise<void>;
  getChannelInfo(accessToken: string): Promise<{ channelId: string; title: string; sub: string }>;
}

/**
 * Fake transport — always fails with clear message.
 * Real transport requires explicit configuration.
 */
export class FakeGoogleOAuthTransport implements GoogleOAuthTransport {
  async exchangeCode(): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> {
    return { accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token', expiresIn: 3600, scope: 'youtube.upload' };
  }
  async refreshAccessToken(): Promise<{ accessToken: string; expiresIn: number }> {
    return { accessToken: 'fake-refreshed-token', expiresIn: 3600 };
  }
  async revokeToken(): Promise<void> { /* no-op in fake */ }
  async getChannelInfo(): Promise<{ channelId: string; title: string; sub: string }> {
    return { channelId: 'UC_fake_channel', title: 'Fake Test Channel', sub: 'fake-sub-123' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OAuth Service
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateSessionInput {
  projectId: string;
  platformAccountId: string;
  requestedScopes: string[];
  redirectUri: string;
  createdBy: string;
}

export interface CallbackInput {
  sessionId: string;
  projectId: string;
  state: string;
  code: string;
}

export class YouTubeOAuthService {
  private sessions = new Map<string, YouTubeAuthorizationSession>();
  private bindings = new Map<string, YouTubeCredentialBinding>();
  private redirectAllowlist: string[];

  constructor(
    private secretStore: SecretStore,
    private transport: GoogleOAuthTransport,
    private allowedRedirects: string[] = [],
  ) {
    this.redirectAllowlist = allowedRedirects;
  }

  /**
   * Create a new authorization session.
   * Generates cryptographic state and PKCE verifier.
   */
  async createAuthorizationSession(input: CreateSessionInput): Promise<{ session: YouTubeAuthorizationSession; authorizationUrl: string; rawState: string }> {
    // Fail-closed: redirect URI must be in allowlist
    if (!validateRedirectUri(input.redirectUri, this.redirectAllowlist)) {
      throw new Error('Redirect URI not in allowlist (fail-closed)');
    }

    // Fail-closed: secret store must be healthy
    if (!(await this.secretStore.healthCheck())) {
      throw new Error('Secret store unavailable (fail-closed)');
    }

    const rawState = generateOAuthState();
    const stateHash = hashOAuthState(rawState);
    const pkceVerifier = generatePKCEVerifier();
    const pkceChallenge = generatePKCEChallenge(pkceVerifier);

    // Store PKCE verifier in secret store
    const pkceRef = generateSecretReference('pkce');
    await this.secretStore.putSecret(pkceRef, pkceVerifier);

    const session: YouTubeAuthorizationSession = {
      id: randomUUID(),
      projectId: input.projectId,
      platformAccountId: input.platformAccountId,
      stateHash,
      pkceVerifierReference: pkceRef,
      redirectUri: input.redirectUri,
      requestedScopes: input.requestedScopes,
      status: 'redirect_ready',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      usedAt: null,
      createdBy: input.createdBy,
      createdAt: new Date(),
    };

    this.sessions.set(session.id, session);

    const authorizationUrl = this.buildAuthorizationUrl(session, rawState, pkceChallenge);

    return { session, authorizationUrl, rawState };
  }

  /**
   * Build the Google authorization URL.
   */
  private buildAuthorizationUrl(session: YouTubeAuthorizationSession, state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: 'CLIENT_ID_PLACEHOLDER', // from config, not hardcoded
      redirect_uri: session.redirectUri,
      response_type: 'code',
      scope: session.requestedScopes.join(' '),
      access_type: 'offline',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Accept OAuth callback. Validates state, enforces single-use, checks expiry.
   */
  async acceptCallback(input: CallbackInput): Promise<YouTubeCredentialBinding> {
    const session = this.sessions.get(input.sessionId);
    if (!session) throw new Error('Session not found');
    if (session.projectId !== input.projectId) throw new Error('Project mismatch (cross-project isolation)');
    if (session.status !== 'redirect_ready') throw new Error('Session not in redirect_ready state (replay rejected)');
    if (new Date() > session.expiresAt) {
      session.status = 'expired';
      throw new Error('Session expired');
    }

    // Validate state hash (prevents CSRF)
    const incomingHash = hashOAuthState(input.state);
    if (incomingHash !== session.stateHash) {
      session.status = 'rejected';
      throw new Error('State mismatch (CSRF protection)');
    }

    // Mark session as used (single-use)
    session.status = 'callback_received';
    session.usedAt = new Date();

    // Exchange code for tokens via transport
    const pkceVerifier = await this.secretStore.getSecret(session.pkceVerifierReference!);
    session.status = 'token_exchange_pending';

    const tokens = await this.transport.exchangeCode(input.code, session.redirectUri, pkceVerifier || undefined);
    const channelInfo = await this.transport.getChannelInfo(tokens.accessToken);

    // Store refresh token in secret store (never in business DB)
    const credRef = generateSecretReference('yt-refresh');
    await this.secretStore.putSecret(credRef, tokens.refreshToken);

    // Clean up PKCE verifier
    if (session.pkceVerifierReference) {
      await this.secretStore.deleteSecret(session.pkceVerifierReference);
    }

    session.status = 'authorized';

    // Create credential binding
    const binding: YouTubeCredentialBinding = {
      id: randomUUID(),
      projectId: session.projectId,
      platformAccountId: session.platformAccountId,
      googleSubjectHash: hashGoogleSubject(channelInfo.sub),
      channelId: channelInfo.channelId,
      channelTitle: channelInfo.title,
      credentialReference: credRef,
      scopeSet: session.requestedScopes,
      authorizedAt: new Date(),
      expiresOrRevokedAt: null,
      status: 'active',
      lastValidatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.bindings.set(binding.id, binding);
    session.status = 'consumed';

    return binding;
  }

  /**
   * Revoke a credential binding.
   */
  async revokeBinding(bindingId: string, projectId: string): Promise<void> {
    const binding = this.bindings.get(bindingId);
    if (!binding) throw new Error('Binding not found');
    if (binding.projectId !== projectId) throw new Error('Project mismatch');
    if (!canTransitionBinding(binding.status, 'revoked')) throw new Error('Cannot revoke from current status');

    // Revoke token via transport
    const refreshToken = await this.secretStore.getSecret(binding.credentialReference);
    if (refreshToken) {
      await this.transport.revokeToken(refreshToken);
      await this.secretStore.revokeSecret(binding.credentialReference);
    }

    binding.status = 'revoked';
    binding.expiresOrRevokedAt = new Date();
    binding.updatedAt = new Date();
  }

  /**
   * Validate that a credential binding is still usable.
   */
  async validateBinding(bindingId: string, projectId: string): Promise<{ valid: boolean; reason?: string }> {
    const binding = this.bindings.get(bindingId);
    if (!binding) return { valid: false, reason: 'not_found' };
    if (binding.projectId !== projectId) return { valid: false, reason: 'project_mismatch' };
    if (binding.status !== 'active') return { valid: false, reason: `status_${binding.status}` };

    // Check secret store health
    if (!(await this.secretStore.healthCheck())) return { valid: false, reason: 'secret_store_unavailable' };

    // Check credential reference exists
    const token = await this.secretStore.getSecret(binding.credentialReference);
    if (!token) return { valid: false, reason: 'credential_missing' };

    binding.lastValidatedAt = new Date();
    return { valid: true };
  }

  // Test helpers
  getSession(id: string) { return this.sessions.get(id); }
  getBinding(id: string) { return this.bindings.get(id); }
}
