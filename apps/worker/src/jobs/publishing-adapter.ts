/**
 * Publishing Adapter Contract, Lifecycle Guards, and Security Foundation
 * AIDILAM-DEP-015A
 */
import { randomUUID } from 'crypto';
import { logger } from '../logging/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Status Types
// ═══════════════════════════════════════════════════════════════════════════════

export type PublishingJobStatus = 'draft' | 'scheduled' | 'queued' | 'publishing' | 'retry_wait' | 'cancel_requested' | 'cancelled' | 'succeeded' | 'failed';
export type AttemptStatus = 'queued' | 'running' | 'retryable_failed' | 'permanent_failed' | 'cancelled' | 'succeeded';
export type ReservationStatus = 'reserved' | 'committed' | 'released' | 'expired';

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Input Types (Server-Resolved Only)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResolvedAccountInput { accountId: string; platformKey: string; projectId: string; }
export interface ResolvedDestinationInput { destinationId: string; accountId: string; platformKey: string; projectId: string; }
export interface ResolvedMediaInput { assetId: string; mimeType: string; sizeBytes: number; durationMs: number; width: number; height: number; platformKey: string; limits: Record<string, unknown>; }
export interface PublishPlanInput { platformKey: string; mediaSizeBytes: number; mediaDurationMs: number; }
export interface ServerResolvedPublishInput { jobId: string; projectId: string; sourceAssetKey: string; caption: string; hashtags: string[]; privacy: string; platformKey: string; validationScenario?: string; }
export interface PollStatusInput { jobId: string; externalPublishId: string; platformKey: string; }
export interface CancelPublishInput { jobId: string; externalPublishId?: string; platformKey: string; }

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Result Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AccountValidationResult { valid: boolean; errorCode?: string; errorMessage?: string; }
export interface DestinationValidationResult { valid: boolean; errorCode?: string; errorMessage?: string; }
export interface MediaValidationResult { valid: boolean; errorCode?: string; errorMessage?: string; unsupportedReason?: string; }
export interface QuotaEstimate { publishOperations: number; platformRequests: number; uploadBytes: number; quotaUnits: number; estimatedCost: number; }
export interface PublishResult { success: boolean; pending?: boolean; externalPublishId?: string; publishedUrl?: string; retryable?: boolean; retryAfterMs?: number; errorCode?: string; errorMessage?: string; duplicate?: boolean; }
export interface PollStatusResult { status: 'pending' | 'succeeded' | 'failed'; externalPublishId?: string; publishedUrl?: string; errorCode?: string; retryable?: boolean; }
export interface CancelPublishResult { cancelled: boolean; unsupported?: boolean; alreadyTerminal?: boolean; }

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Interface
// ═══════════════════════════════════════════════════════════════════════════════

export interface PublishingAdapter {
  readonly adapterKey: string;
  readonly platformKey: string;
  validateAccount(input: ResolvedAccountInput): Promise<AccountValidationResult>;
  validateDestination(input: ResolvedDestinationInput): Promise<DestinationValidationResult>;
  validateMedia(input: ResolvedMediaInput): Promise<MediaValidationResult>;
  estimateQuota(input: PublishPlanInput): Promise<QuotaEstimate>;
  publish(input: ServerResolvedPublishInput): Promise<PublishResult>;
  pollStatus(input: PollStatusInput): Promise<PollStatusResult>;
  cancel(input: CancelPublishInput): Promise<CancelPublishResult>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lifecycle Guards
// ═══════════════════════════════════════════════════════════════════════════════

const JOB_TRANSITIONS: Record<PublishingJobStatus, PublishingJobStatus[]> = {
  draft: ['scheduled', 'queued'],
  scheduled: ['queued', 'cancel_requested', 'cancelled'],
  queued: ['publishing', 'cancel_requested', 'cancelled'],
  publishing: ['retry_wait', 'succeeded', 'failed', 'cancel_requested', 'cancelled'],
  retry_wait: ['queued', 'cancel_requested', 'cancelled'],
  cancel_requested: ['cancelled'],
  cancelled: [],
  succeeded: [],
  failed: [],
};

export function canTransitionJob(from: PublishingJobStatus, to: PublishingJobStatus): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

const ATTEMPT_TRANSITIONS: Record<AttemptStatus, AttemptStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'retryable_failed', 'permanent_failed', 'cancelled'],
  retryable_failed: [],
  permanent_failed: [],
  cancelled: [],
  succeeded: [],
};

export function canTransitionAttempt(from: AttemptStatus, to: AttemptStatus): boolean {
  return ATTEMPT_TRANSITIONS[from]?.includes(to) ?? false;
}

const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  reserved: ['committed', 'released', 'expired'],
  committed: [],
  released: [],
  expired: [],
};

export function canSettleReservation(from: ReservationStatus, to: ReservationStatus): boolean {
  if (from === to) return true; // idempotent same-state
  return RESERVATION_TRANSITIONS[from]?.includes(to) ?? false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Security Foundation
// ═══════════════════════════════════════════════════════════════════════════════

const CREDENTIAL_FIELDS = new Set([
  'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
  'password', 'cookie', 'cookies', 'authorization',
  'client_secret', 'clientsecret', 'session', 'session_id',
  'sessionid', 'oauth_token', 'oauthtoken', 'bearer',
]);

export function detectCredentialFields(obj: unknown, path = '', depth = 0): string[] {
  if (depth > 5 || obj === null || obj === undefined) return [];
  const found: string[] = [];
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[-_]/g, '');
      if (CREDENTIAL_FIELDS.has(normalized) || CREDENTIAL_FIELDS.has(key.toLowerCase())) {
        found.push(path ? `${path}.${key}` : key);
      }
      if (typeof val === 'object' && val !== null) {
        found.push(...detectCredentialFields(val, path ? `${path}.${key}` : key, depth + 1));
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < Math.min(obj.length, 20); i++) {
      if (typeof obj[i] === 'object' && obj[i] !== null) {
        found.push(...detectCredentialFields(obj[i], `${path}[${i}]`, depth + 1));
      }
    }
  }
  return found;
}

const CLIENT_AUTHORITY_FIELDS = new Set([
  'status', 'progress', 'progress_percent', 'current_stage',
  'external_publish_id', 'published_url', 'published_url_safe',
  'attempt_number', 'current_attempt', 'max_attempts',
  'adapter_key', 'platform_response', 'retry_count',
  'error_code', 'error_message_safe', 'reservation_status',
  'committed_cost', 'quota_units', 'usage',
  'completed_at', 'started_at', 'queued_at',
]);

export function detectClientAuthorityFields(obj: unknown): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const found: string[] = [];
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (CLIENT_AUTHORITY_FIELDS.has(key) || CLIENT_AUTHORITY_FIELDS.has(key.toLowerCase())) {
      found.push(key);
    }
  }
  return found;
}

export function validateUrlSafety(url: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.toLowerCase();
    if (!['http:', 'https:'].includes(scheme)) return { safe: false, reason: `Unsupported scheme: ${scheme}` };
    const host = parsed.hostname.toLowerCase();
    if (['localhost', 'localhost.localdomain', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254'].includes(host)) return { safe: false, reason: 'Loopback or metadata address' };
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) return { safe: false, reason: 'Private RFC1918 address' };
    if (/^(fc|fd|fe80)/i.test(host)) return { safe: false, reason: 'Private/link-local IPv6' };
    if (parsed.username || parsed.password) return { safe: false, reason: 'Embedded credentials' };
    return { safe: true };
  } catch { return { safe: false, reason: 'Malformed URL' }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mock Adapter Implementation
// ═══════════════════════════════════════════════════════════════════════════════

async function mockPublish(input: ServerResolvedPublishInput, platform: string, postType: string): Promise<PublishResult> {
  const scenario = (process.env.AIDILAM_VALIDATION_MODE === 'true' && input.validationScenario) ? input.validationScenario : 'publish_success';
  const id = randomUUID();
  logger.info('mock publish invoked', { jobId: input.jobId, platform, scenario });
  switch (scenario) {
    case 'publish_transient_failure': return { success: false, retryable: true, errorCode: 'MOCK_TRANSIENT', errorMessage: 'Transient failure (mock)' };
    case 'publish_permanent_failure': return { success: false, retryable: false, errorCode: 'MOCK_PERMANENT', errorMessage: 'Permanent failure (mock)' };
    case 'publish_timeout': return { success: false, retryable: true, errorCode: 'MOCK_TIMEOUT', errorMessage: 'Timeout (mock)', retryAfterMs: 3000 };
    case 'publish_rate_limited': return { success: false, retryable: true, errorCode: 'MOCK_RATE_LIMITED', errorMessage: 'Rate limited (mock)', retryAfterMs: 5000 };
    case 'publish_duplicate_external_result': return { success: true, externalPublishId: `mock-${platform}-${postType}-duplicate`, publishedUrl: `mock://${platform}/duplicate`, duplicate: true };
    case 'publish_cancel_active': return { success: false, retryable: false, errorCode: 'MOCK_CANCELLED', errorMessage: 'Cancelled during publish (mock)' };
    // Unsafe URL scenarios (for D1B validation)
    case 'publish_unsafe_url_https': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'https://example.invalid/item' };
    case 'publish_unsafe_url_http': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'http://example.invalid/item' };
    case 'publish_unsafe_url_localhost': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'http://localhost/item' };
    case 'publish_unsafe_url_loopback': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'http://127.0.0.1/item' };
    case 'publish_unsafe_url_private10': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'http://10.0.0.1/item' };
    case 'publish_unsafe_url_private172': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'http://172.16.0.1/item' };
    case 'publish_unsafe_url_private192': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'http://192.168.1.1/item' };
    case 'publish_unsafe_url_metadata': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'http://169.254.169.254/latest/meta-data' };
    case 'publish_unsafe_url_file': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'file:///tmp/item' };
    case 'publish_unsafe_url_ftp': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'ftp://example.invalid/item' };
    case 'publish_unsafe_url_credentials': return { success: true, externalPublishId: `mock-${id}`, publishedUrl: 'http://user:password@example.invalid/item' };
    // D2 retry/poll scenarios
    case 'publish_mock_retryable_once': return { success: false, retryable: true, errorCode: 'MOCK_TRANSIENT', errorMessage: 'Retryable once (mock)' };
    case 'publish_mock_always_retryable': return { success: false, retryable: true, errorCode: 'MOCK_RATE_LIMITED', errorMessage: 'Always retryable (mock)' };
    case 'publish_mock_pending': return { success: true, pending: true, externalPublishId: `mock-pending-${id}`, publishedUrl: undefined };
    case 'publish_mock_pending_then_fail': return { success: true, pending: true, externalPublishId: `mock-pending-fail-${id}`, publishedUrl: undefined };
    case 'publish_mock_poll_timeout': return { success: true, pending: true, externalPublishId: `mock-poll-timeout-${id}`, publishedUrl: undefined };
    case 'publish_mock_cancel_fail': return { success: true, pending: true, externalPublishId: `mock-cancel-fail-${id}`, publishedUrl: undefined };
    case 'publish_mock_cancel_timeout': return { success: true, pending: true, externalPublishId: `mock-cancel-timeout-${id}`, publishedUrl: undefined };
    // D2C barrier scenarios (delayed to allow cancel injection)
    case 'publish_mock_success_barrier': {
      await new Promise(r => setTimeout(r, 4000)); // 4s barrier for cancel injection
      return { success: true, externalPublishId: `mock-barrier-${id}`, publishedUrl: `mock://${platform}/barrier-${id}` };
    }
    case 'publish_mock_slow_success': {
      await new Promise(r => setTimeout(r, 8000)); // 8s slow success for concurrency sampling
      return { success: true, externalPublishId: `mock-slow-${id}`, publishedUrl: `mock://${platform}/slow-${id}` };
    }
    case 'publish_mock_poll_success_barrier': return { success: true, pending: true, externalPublishId: `mock-poll-barrier-${id}`, publishedUrl: undefined };
    default: return { success: true, externalPublishId: `mock-${platform}-${postType}-${id}`, publishedUrl: `mock://${platform}/${id}` };
  }
}

class BaseMockAdapter implements PublishingAdapter {
  constructor(public readonly adapterKey: string, public readonly platformKey: string, private readonly postType: string) {}
  async validateAccount(_input: ResolvedAccountInput): Promise<AccountValidationResult> { return { valid: true }; }
  async validateDestination(_input: ResolvedDestinationInput): Promise<DestinationValidationResult> { return { valid: true }; }
  async validateMedia(input: ResolvedMediaInput): Promise<MediaValidationResult> {
    const limits = input.limits as { max_file_size_bytes?: number; max_video_duration_ms?: number };
    if (limits.max_file_size_bytes && input.sizeBytes > limits.max_file_size_bytes) return { valid: false, errorCode: 'FILE_TOO_LARGE', unsupportedReason: 'Exceeds size limit' };
    if (limits.max_video_duration_ms && input.durationMs > limits.max_video_duration_ms) return { valid: false, errorCode: 'DURATION_TOO_LONG', unsupportedReason: 'Exceeds duration limit' };
    return { valid: true };
  }
  async estimateQuota(_input: PublishPlanInput): Promise<QuotaEstimate> { return { publishOperations: 1, platformRequests: 2, uploadBytes: _input.mediaSizeBytes, quotaUnits: 1, estimatedCost: 0.01 }; }
  async publish(input: ServerResolvedPublishInput): Promise<PublishResult> { return mockPublish(input, this.platformKey, this.postType); }
  async pollStatus(input: PollStatusInput): Promise<PollStatusResult> {
    logger.info('mock pollStatus invoked', { jobId: input.jobId, externalId: input.externalPublishId });
    // Poll-timeout scenario: always returns pending
    if (input.externalPublishId?.startsWith('mock-poll-timeout-')) {
      return { status: 'pending' };
    }
    // Poll-success barrier: delay 4s then return success
    if (input.externalPublishId?.startsWith('mock-poll-barrier-')) {
      await new Promise(r => setTimeout(r, 4000));
      return { status: 'succeeded', externalPublishId: input.externalPublishId, publishedUrl: `mock://${this.platformKey}/poll-barrier-success` };
    }
    // Pending-then-fail scenario
    if (input.externalPublishId?.startsWith('mock-pending-fail-')) {
      return { status: 'failed', errorCode: 'MOCK_POLL_PERMANENT_FAILURE', retryable: false };
    }
    // Default: pending items resolve to succeeded on first poll
    return { status: 'succeeded', externalPublishId: input.externalPublishId, publishedUrl: `mock://${this.platformKey}/polled-${input.externalPublishId?.slice(-8)}` };
  }
  async cancel(input: CancelPublishInput): Promise<CancelPublishResult> {
    logger.info('mock cancel invoked', { jobId: input.jobId, externalId: input.externalPublishId });
    // Cancel failure scenarios
    if (input.externalPublishId?.startsWith('mock-cancel-fail-')) {
      return { cancelled: false, unsupported: false, alreadyTerminal: false };
    }
    if (input.externalPublishId?.startsWith('mock-cancel-timeout-')) {
      // Simulate timeout by throwing
      throw new Error('Cancel operation timed out (mock)');
    }
    return { cancelled: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Registry
// ═══════════════════════════════════════════════════════════════════════════════

const adapters: Map<string, PublishingAdapter> = new Map([
  ['facebook', new BaseMockAdapter('mock-facebook', 'facebook', 'post')],
  ['tiktok', new BaseMockAdapter('mock-tiktok', 'tiktok', 'video')],
  ['youtube', new BaseMockAdapter('mock-youtube', 'youtube', 'video')],
  ['douyin', new BaseMockAdapter('mock-douyin', 'douyin', 'video')],
  ['bilibili', new BaseMockAdapter('mock-bilibili', 'bilibili', 'video')],
  ['xiaohongshu', new BaseMockAdapter('mock-xiaohongshu', 'xiaohongshu', 'note')],
]);

export function getPublishingAdapter(platformKey: string): PublishingAdapter {
  const adapter = adapters.get(platformKey);
  if (!adapter) throw new Error(`Unknown publishing platform: ${platformKey}`);
  return adapter;
}
