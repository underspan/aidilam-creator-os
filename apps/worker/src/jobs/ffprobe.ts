/**
 * FFprobe Metadata Extraction
 *
 * Invokes ffprobe safely using argument array (no shell interpolation).
 * Input path must be server-generated. Timeout enforced. Output bounded.
 */

import { spawn } from 'node:child_process';
import { logger } from '../logging/index.js';

const FFPROBE_PATH = '/usr/bin/ffprobe';
const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1_048_576; // 1 MB

export interface MediaMetadata {
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  frame_rate: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  audio_channels: number | null;
  sample_rate: number | null;
  format_name: string | null;
}

export async function probeMedia(filePath: string): Promise<MediaMetadata> {
  // Validate path is within expected temp directory
  if (!filePath.startsWith('/tmp/aidilam-assets/')) {
    throw new Error('FFprobe: invalid file path - must be in /tmp/aidilam-assets/');
  }

  const args = [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-print_format', 'json',
    filePath,
  ];

  const output = await runProbe(args);
  return parseProbeOutput(output);
}

function runProbe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn(FFPROBE_PATH, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
      env: { PATH: '/usr/bin:/bin' }, // Minimal env
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        killed = true;
        proc.kill('SIGKILL');
        return;
      }
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`FFprobe spawn error: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (killed) {
        reject(new Error('FFprobe: output exceeded maximum size'));
        return;
      }
      if (code !== 0) {
        logger.warn('FFprobe non-zero exit', { code, stderr: stderr.slice(0, 500) });
        reject(new Error(`FFprobe exited with code ${code}`));
        return;
      }
      resolve(stdout);
    });

    // Handle timeout
    setTimeout(() => {
      if (!proc.killed) {
        killed = true;
        proc.kill('SIGKILL');
        reject(new Error('FFprobe: timeout exceeded'));
      }
    }, TIMEOUT_MS);
  });
}

function parseProbeOutput(json: string): MediaMetadata {
  let data: { format?: Record<string, unknown>; streams?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('FFprobe: invalid JSON output');
  }

  const result: MediaMetadata = {
    duration_ms: null,
    width: null,
    height: null,
    frame_rate: null,
    video_codec: null,
    audio_codec: null,
    audio_channels: null,
    sample_rate: null,
    format_name: null,
  };

  // Extract format info
  if (data.format) {
    const dur = parseFloat(data.format.duration as string);
    if (!isNaN(dur)) result.duration_ms = Math.round(dur * 1000);
    result.format_name = (data.format.format_name as string) || null;
  }

  // Extract stream info
  const streams = data.streams || [];

  // Video stream (first)
  const videoStream = streams.find(s => s.codec_type === 'video');
  if (videoStream) {
    result.video_codec = (videoStream.codec_name as string) || null;
    result.width = parseInt(videoStream.width as string, 10) || null;
    result.height = parseInt(videoStream.height as string, 10) || null;

    // Frame rate from r_frame_rate or avg_frame_rate
    const fr = (videoStream.r_frame_rate as string) || (videoStream.avg_frame_rate as string);
    if (fr) {
      const [num, den] = fr.split('/').map(Number);
      if (num && den) result.frame_rate = Math.round((num / den) * 100) / 100;
    }
  }

  // Audio stream (first)
  const audioStream = streams.find(s => s.codec_type === 'audio');
  if (audioStream) {
    result.audio_codec = (audioStream.codec_name as string) || null;
    result.audio_channels = parseInt(audioStream.channels as string, 10) || null;
    result.sample_rate = parseInt(audioStream.sample_rate as string, 10) || null;

    // If no video format duration, try audio duration
    if (!result.duration_ms && audioStream.duration) {
      const dur = parseFloat(audioStream.duration as string);
      if (!isNaN(dur)) result.duration_ms = Math.round(dur * 1000);
    }
  }

  return result;
}
