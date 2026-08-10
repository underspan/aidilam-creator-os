/**
 * Real Local Whisper STT Provider
 * Calls faster-whisper via Python subprocess for actual speech recognition.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../logging/index.js';

const TRANSCRIBE_SCRIPT = '/opt/aidilam-studio/runtime/transcription/transcribe.py';
const PYTHON = 'python3';
const DEFAULT_MODEL = 'tiny';
const TIMEOUT_MS = 120_000;

export interface RealSttSegmentInput {
  segmentId: string;
  audioPath: string;
  startMs: number;
  endMs: number;
  language?: string;
  traceId: string;
}

export interface RealSttWord {
  wordIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
}

export interface RealSttSegmentResult {
  words: RealSttWord[];
  detectedLanguage: string;
  languageProbability: number;
}

export class LocalWhisperProvider {
  public readonly code = 'local_whisper_real';

  async transcribeSegment(input: RealSttSegmentInput): Promise<RealSttSegmentResult> {
    if (!existsSync(TRANSCRIBE_SCRIPT)) {
      throw new Error(`Transcription script not found: ${TRANSCRIBE_SCRIPT}`);
    }
    if (!existsSync(input.audioPath)) {
      throw new Error(`Audio file not found: ${input.audioPath}`);
    }

    const model = process.env.WHISPER_MODEL || DEFAULT_MODEL;
    const language = input.language || 'zh';

    try {
      const output = execFileSync(PYTHON, [TRANSCRIBE_SCRIPT, input.audioPath, model, language], {
        timeout: TIMEOUT_MS,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      const result = JSON.parse(output.trim());

      if (result.error) {
        throw new Error(`Whisper error: ${result.error}`);
      }

      // Convert to word-level format expected by the transcription orchestrator
      const words: RealSttWord[] = [];
      let wordIndex = 0;
      for (const seg of result.segments || []) {
        // Split segment text into words with proportional timing
        const segWords = (seg.text || '').split(/\s+/).filter((w: string) => w.length > 0);
        const segDuration = seg.end_ms - seg.start_ms;
        const wordDuration = segWords.length > 0 ? segDuration / segWords.length : 0;

        for (let i = 0; i < segWords.length; i++) {
          words.push({
            wordIndex,
            startMs: seg.start_ms + Math.round(i * wordDuration),
            endMs: seg.start_ms + Math.round((i + 1) * wordDuration),
            text: segWords[i],
            confidence: seg.confidence || 0.9,
          });
          wordIndex++;
        }
      }

      return {
        words,
        detectedLanguage: result.language || 'zh',
        languageProbability: result.language_probability || 0.99,
      };
    } catch (err: any) {
      if (err.killed) throw new Error('Whisper transcription timed out');
      throw new Error(`Whisper failed: ${err.message}`);
    }
  }

  estimateDuration(_audioLengthMs: number): number {
    return 30000; // Estimate 30s for processing
  }
}
