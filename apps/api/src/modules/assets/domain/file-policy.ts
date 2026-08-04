/**
 * File Policy — Asset Ingestion
 *
 * Defines allowed content types, size limits, and media kind classification
 * for the asset upload pipeline.
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'subtitle' | 'other';

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
]);

export const ALLOWED_SUBTITLE_TYPES = new Set([
  'text/plain',
  'application/x-subrip',
  'text/vtt',
]);

export const ALL_ALLOWED_TYPES = new Set([
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_AUDIO_TYPES,
  ...ALLOWED_SUBTITLE_TYPES,
]);

/** Maximum file size in bytes per media kind */
export const SIZE_LIMITS: Record<string, number> = {
  image: 50 * 1024 * 1024,         // 50 MB
  audio: 500 * 1024 * 1024,        // 500 MB
  video: 5 * 1024 * 1024 * 1024,   // 5 GB
  subtitle: 10 * 1024 * 1024,      // 10 MB
  other: 50 * 1024 * 1024,         // 50 MB (fallback)
};

/**
 * Classify a content type into a media kind.
 */
export function getMediaKind(contentType: string): MediaKind {
  if (ALLOWED_IMAGE_TYPES.has(contentType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.has(contentType)) return 'video';
  if (ALLOWED_AUDIO_TYPES.has(contentType)) return 'audio';
  if (ALLOWED_SUBTITLE_TYPES.has(contentType)) return 'subtitle';
  return 'other';
}

/**
 * Check if a content type is in the allowed list.
 */
export function isAllowedType(contentType: string): boolean {
  return ALL_ALLOWED_TYPES.has(contentType);
}

/**
 * Get the maximum allowed file size in bytes for a given content type.
 */
export function getMaxSizeBytes(contentType: string): number {
  const kind = getMediaKind(contentType);
  return SIZE_LIMITS[kind] ?? SIZE_LIMITS['other'];
}

/**
 * Validate that a file size is within the allowed limit for its content type.
 */
export function validateFileSize(
  contentType: string,
  sizeBytes: number,
): { valid: boolean; maxBytes: number } {
  const maxBytes = getMaxSizeBytes(contentType);
  return { valid: sizeBytes <= maxBytes, maxBytes };
}
