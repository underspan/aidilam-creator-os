/**
 * Real Edge-TTS Provider — Microsoft Edge Neural TTS
 * Calls Python subprocess for actual Vietnamese speech synthesis.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { logger } from '../logging/index.js';

const EDGE_TTS_SCRIPT = '/opt/aidilam-studio/runtime/tts/edge_tts_adapter.py';
const PYTHON = 'python3';
const TIMEOUT_MS = 30_000;

export interface EdgeTtsSynthesisResult {
  audioPath: string;
  sizeBytes: number;
  format: string;
  voice: string;
  durationEstimateMs: number;
}

export class EdgeTtsProvider {
  public readonly code = 'edge_tts_real';
  public readonly displayName = 'Edge TTS (Microsoft, free)';

  async synthesizeCue(
    text: string,
    voiceCode: string,
    outputPath: string,
    speed?: string,
  ): Promise<EdgeTtsSynthesisResult> {
    if (!existsSync(EDGE_TTS_SCRIPT)) {
      throw new Error(`Edge TTS script not found: ${EDGE_TTS_SCRIPT}`);
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Empty text cannot be synthesized');
    }

    const voice = voiceCode || 'vi-VN-HoaiMyNeural';
    const args = [EDGE_TTS_SCRIPT, text, voice, outputPath];
    if (speed) args.push(speed);

    try {
      const stdout = execFileSync(PYTHON, args, {
        timeout: TIMEOUT_MS,
        encoding: 'utf-8',
        maxBuffer: 5 * 1024 * 1024,
      });

      const result = JSON.parse(stdout.trim());

      if (!result.success) {
        throw new Error(`Edge TTS failed: ${result.error || 'unknown'}`);
      }

      const sizeBytes = existsSync(outputPath) ? statSync(outputPath).size : 0;
      if (sizeBytes < 100) {
        throw new Error('Edge TTS output too small (likely failed)');
      }

      // Estimate duration from file size (MP3 at ~48kbps)
      const durationEstimateMs = Math.round((sizeBytes * 8) / 48);

      return {
        audioPath: outputPath,
        sizeBytes,
        format: 'mp3',
        voice,
        durationEstimateMs,
      };
    } catch (err: any) {
      if (err.killed) throw new Error('Edge TTS timed out');
      if (err.message?.includes('Edge TTS')) throw err;
      throw new Error(`Edge TTS process error: ${err.message}`);
    }
  }
}
