/**
 * Filename Sanitization — Asset Ingestion
 *
 * Provides safe filename handling to prevent path traversal,
 * injection, and filesystem compatibility issues.
 */

/** Characters considered unsafe for filenames (replaced with '-') */
const UNSAFE_CHARS = /[<>:"|?*#{}^~`[\]@!$&'()+,;=\s]+/g;

/** Control characters (U+0000–U+001F and U+007F–U+009F) */
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

/** Maximum filename length */
const MAX_FILENAME_LENGTH = 200;

/**
 * Sanitize a filename for safe storage.
 *
 * Rules applied:
 * 1. NFC normalize Unicode
 * 2. Remove null bytes
 * 3. Remove path separators (/ and \)
 * 4. Remove control characters
 * 5. Prevent Windows drive prefixes (C:)
 * 6. Prevent path traversal (..)
 * 7. Prevent dotfiles (leading dot)
 * 8. Replace unsafe characters with -
 * 9. Collapse multiple consecutive dashes
 * 10. Limit to 200 characters (preserve extension)
 * 11. Lowercase extension
 * 12. Fallback to 'unnamed' if empty after sanitization
 */
export function sanitizeFilename(input: string): string {
  if (!input) return 'unnamed';

  // NFC normalize
  let name = input.normalize('NFC');

  // Remove null bytes
  name = name.replace(/\0/g, '');

  // Remove path separators
  name = name.replace(/[/\\]/g, '');

  // Remove control characters
  name = name.replace(CONTROL_CHARS, '');

  // Prevent Windows drive prefix (e.g., C: or D:)
  name = name.replace(/^[a-zA-Z]:/, '');

  // Prevent path traversal
  name = name.replace(/\.\./g, '');

  // Prevent dotfiles (leading dot)
  name = name.replace(/^\.+/, '');

  // Replace unsafe characters with -
  name = name.replace(UNSAFE_CHARS, '-');

  // Collapse multiple consecutive dashes
  name = name.replace(/-{2,}/g, '-');

  // Trim leading/trailing dashes
  name = name.replace(/^-+|-+$/g, '');

  // Separate extension and base
  const lastDot = name.lastIndexOf('.');
  let base: string;
  let ext: string;

  if (lastDot > 0) {
    base = name.slice(0, lastDot).replace(/-+$/, '');
    ext = name.slice(lastDot).toLowerCase();
  } else {
    base = name;
    ext = '';
  }

  // Limit length while preserving extension
  const maxBaseLength = MAX_FILENAME_LENGTH - ext.length;
  if (base.length > maxBaseLength) {
    base = base.slice(0, maxBaseLength).replace(/-+$/, '');
  }

  const result = base + ext;

  // Fallback if empty after all sanitization
  if (!result || result === ext) {
    return ext ? `unnamed${ext}` : 'unnamed';
  }

  return result;
}

/**
 * Generate a deterministic object key for storing an asset in MinIO.
 *
 * Format: projects/<projectId>/assets/<assetId>/source/<sanitizedFilename>
 */
export function generateObjectKey(
  projectId: string,
  assetId: string,
  sanitizedFilename: string,
): string {
  return `projects/${projectId}/assets/${assetId}/source/${sanitizedFilename}`;
}
