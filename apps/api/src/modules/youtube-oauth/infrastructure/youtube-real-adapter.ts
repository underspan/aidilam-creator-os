/**
 * YouTube Real Adapter Skeleton
 * AIDILAM-DEP-016A3
 *
 * Conforms to PublishingAdapter interface but remains DISABLED.
 * All operations fail-closed with ADAPTER_DISABLED or NOT_CONFIGURED.
 * No network calls. No upload logic. No token retrieval.
 *
 * NOTE: This skeleton uses inline types matching the worker's PublishingAdapter interface.
 * Full integration will import from a shared package in DEP-016A4.
 */

const YOUTUBE_ENABLED = process.env.YOUTUBE_REAL_ADAPTER_ENABLED === 'true';

interface AdapterResult { success?: boolean; valid?: boolean; errorCode?: string; errorMessage?: string; }

export class YouTubeRealAdapter {
  readonly adapterKey = 'youtube-real';
  readonly platformKey = 'youtube';
  readonly enabled = YOUTUBE_ENABLED;

  async validateAccount(): Promise<AdapterResult> {
    if (!YOUTUBE_ENABLED) return { valid: false, errorCode: 'ADAPTER_DISABLED', errorMessage: 'YouTube real adapter is disabled' };
    return { valid: false, errorCode: 'NOT_CONFIGURED', errorMessage: 'Real YouTube validation not yet implemented' };
  }

  async validateMedia(sizeBytes: number, durationMs: number, limits: { max_file_size_bytes?: number; max_video_duration_ms?: number }): Promise<AdapterResult> {
    if (limits.max_file_size_bytes && sizeBytes > limits.max_file_size_bytes) {
      return { valid: false, errorCode: 'FILE_TOO_LARGE', errorMessage: 'Exceeds YouTube size limit (128GB)' };
    }
    if (limits.max_video_duration_ms && durationMs > limits.max_video_duration_ms) {
      return { valid: false, errorCode: 'DURATION_TOO_LONG', errorMessage: 'Exceeds YouTube duration limit (12hr)' };
    }
    return { valid: true };
  }

  async publish(): Promise<AdapterResult> {
    if (!YOUTUBE_ENABLED) return { success: false, errorCode: 'ADAPTER_DISABLED', errorMessage: 'YouTube real adapter is not enabled' };
    return { success: false, errorCode: 'NOT_CONFIGURED', errorMessage: 'YouTube upload not yet implemented (DEP-016A4)' };
  }

  async pollStatus(): Promise<AdapterResult> {
    return { errorCode: 'NOT_CONFIGURED' };
  }

  async cancel(): Promise<AdapterResult> {
    return { errorCode: 'NOT_CONFIGURED', errorMessage: 'Cancel not supported (adapter disabled)' };
  }
}
