/**
 * FFmpeg Command Builders
 *
 * Typed command builder functions for media preprocessing operations.
 * All commands use argument arrays (no shell interpolation).
 * Input/output paths validated to /tmp/aidilam-media/ prefix.
 *
 * Security: No network protocols, protocol whitelist, -v error for minimal output.
 */

const FFMPEG_BINARY = '/usr/bin/ffmpeg';
const ALLOWED_PATH_PREFIX = '/tmp/aidilam-media/';

export interface FfmpegCommand {
  binary: string;
  args: string[];
  timeoutMs: number;
}

/**
 * Validate that a file path is within the allowed temp directory.
 * Prevents path traversal and use of non-temp locations.
 */
function validatePath(path: string, label: string): void {
  if (!path.startsWith(ALLOWED_PATH_PREFIX)) {
    throw new Error(`${label} path must start with ${ALLOWED_PATH_PREFIX}, got: ${path}`);
  }
  if (path.includes('..')) {
    throw new Error(`${label} path contains path traversal: ${path}`);
  }
}

/**
 * Build command for image normalization.
 * Scale to fit within maxWidth x maxHeight, auto-rotate, strip metadata.
 */
export function buildImageNormalize(
  input: string,
  output: string,
  config: { maxWidth: number; maxHeight: number; quality: number; stripExif: boolean },
): FfmpegCommand {
  validatePath(input, 'input');
  validatePath(output, 'output');

  // Convert quality 0-100 to FFmpeg JPEG quality scale (2-31, lower=better)
  const qualityScale = Math.max(2, Math.min(31, Math.round(31 - (config.quality / 100) * 29)));

  const args: string[] = [
    '-y',
    '-v', 'error',
    '-i', input,
    '-vf', `scale='min(${config.maxWidth},iw)':'min(${config.maxHeight},ih)':force_original_aspect_ratio=decrease`,
  ];

  if (config.stripExif) {
    args.push('-map_metadata', '-1');
  }

  args.push('-q:v', String(qualityScale), output);

  return { binary: FFMPEG_BINARY, args, timeoutMs: 60_000 };
}

/**
 * Build command for image thumbnail generation.
 * Scale to fit within maxWidth x maxHeight.
 */
export function buildImageThumbnail(
  input: string,
  output: string,
  config: { maxWidth: number; maxHeight: number; quality: number; format: string },
): FfmpegCommand {
  validatePath(input, 'input');
  validatePath(output, 'output');

  const qualityScale = Math.max(2, Math.min(31, Math.round(31 - (config.quality / 100) * 29)));

  const args: string[] = [
    '-y',
    '-v', 'error',
    '-i', input,
    '-vf', `scale='min(${config.maxWidth},iw)':'min(${config.maxHeight},ih)':force_original_aspect_ratio=decrease`,
    '-frames:v', '1',
    '-q:v', String(qualityScale),
    output,
  ];

  return { binary: FFMPEG_BINARY, args, timeoutMs: 120_000 };
}

/**
 * Build command for audio normalization.
 * Applies loudness normalization, resamples, and re-encodes.
 */
export function buildAudioNormalize(
  input: string,
  output: string,
  config: { sampleRate: number; channels: number; codec: string; bitrate: string; loudness: string },
): FfmpegCommand {
  validatePath(input, 'input');
  validatePath(output, 'output');

  const args: string[] = [
    '-y',
    '-v', 'error',
    '-i', input,
    '-af', `loudnorm=I=${config.loudness}:TP=-1:LRA=11`,
    '-ar', String(config.sampleRate),
    '-ac', String(config.channels),
    '-c:a', config.codec,
    '-b:a', config.bitrate,
    output,
  ];

  return { binary: FFMPEG_BINARY, args, timeoutMs: 600_000 };
}

/**
 * Build command for audio waveform image generation.
 */
export function buildAudioWaveform(
  input: string,
  output: string,
  config: { width: number; height: number; color: string },
): FfmpegCommand {
  validatePath(input, 'input');
  validatePath(output, 'output');

  const args: string[] = [
    '-y',
    '-v', 'error',
    '-i', input,
    '-filter_complex', `showwavespic=s=${config.width}x${config.height}:colors=${config.color}`,
    '-frames:v', '1',
    output,
  ];

  return { binary: FFMPEG_BINARY, args, timeoutMs: 120_000 };
}

/**
 * Build command for video proxy generation.
 * Transcode to H.264 with constrained quality, fit within maxHeight.
 */
export function buildVideoProxy(
  input: string,
  output: string,
  config: {
    maxHeight: number;
    codec: string;
    preset: string;
    crf: number;
    audioCodec: string;
    audioBitrate: string;
    pixFmt: string;
    movflags: string;
  },
): FfmpegCommand {
  validatePath(input, 'input');
  validatePath(output, 'output');

  const args: string[] = [
    '-y',
    '-v', 'error',
    '-i', input,
    '-vf', `scale=-2:'min(${config.maxHeight},ih)'`,
    '-c:v', config.codec,
    '-preset', config.preset,
    '-crf', String(config.crf),
    '-pix_fmt', config.pixFmt,
    '-c:a', config.audioCodec,
    '-b:a', config.audioBitrate,
    '-movflags', config.movflags,
    output,
  ];

  return { binary: FFMPEG_BINARY, args, timeoutMs: 1_800_000 };
}

/**
 * Build command for video thumbnail extraction.
 * Seeks to a percentage of duration and extracts a single frame.
 */
export function buildVideoThumbnail(
  input: string,
  output: string,
  config: { maxWidth: number; maxHeight: number; seekPercent: number; quality: number },
  durationMs: number,
): FfmpegCommand {
  validatePath(input, 'input');
  validatePath(output, 'output');

  const seekSeconds = Math.max(0, (durationMs / 1000) * (config.seekPercent / 100));
  const qualityScale = Math.max(2, Math.min(31, Math.round(31 - (config.quality / 100) * 29)));

  const args: string[] = [
    '-y',
    '-v', 'error',
    '-ss', String(seekSeconds),
    '-i', input,
    '-vf', `scale='min(${config.maxWidth},iw)':'min(${config.maxHeight},ih)':force_original_aspect_ratio=decrease`,
    '-frames:v', '1',
    '-q:v', String(qualityScale),
    output,
  ];

  return { binary: FFMPEG_BINARY, args, timeoutMs: 120_000 };
}

/**
 * Build command for portrait (9:16) video preview.
 * Crops/pads to target aspect ratio and limits duration.
 */
export function buildVideoPortraitPreview(
  input: string,
  output: string,
  config: { width: number; height: number; duration: number; codec: string; crf: number; crop: string },
): FfmpegCommand {
  validatePath(input, 'input');
  validatePath(output, 'output');

  const args: string[] = [
    '-y',
    '-v', 'error',
    '-i', input,
    '-t', String(config.duration),
    '-vf', `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=${config.width}:${config.height}`,
    '-c:v', config.codec,
    '-crf', String(config.crf),
    '-pix_fmt', 'yuv420p',
    '-an',
    '-movflags', '+faststart',
    output,
  ];

  return { binary: FFMPEG_BINARY, args, timeoutMs: 1_800_000 };
}

/**
 * Build command for square (1:1) video preview.
 * Crops/pads to target aspect ratio and limits duration.
 */
export function buildVideoSquarePreview(
  input: string,
  output: string,
  config: { width: number; height: number; duration: number; codec: string; crf: number; crop: string },
): FfmpegCommand {
  validatePath(input, 'input');
  validatePath(output, 'output');

  // Crop to square (center) then scale
  const args: string[] = [
    '-y',
    '-v', 'error',
    '-i', input,
    '-t', String(config.duration),
    '-vf', `crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2,scale=${config.width}:${config.height}`,
    '-c:v', config.codec,
    '-crf', String(config.crf),
    '-pix_fmt', 'yuv420p',
    '-an',
    '-movflags', '+faststart',
    output,
  ];

  return { binary: FFMPEG_BINARY, args, timeoutMs: 1_800_000 };
}
