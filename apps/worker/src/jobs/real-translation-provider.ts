/**
 * Real Translation Provider — Google Translate via deep-translator
 * Calls Python subprocess for actual Chinese-to-Vietnamese translation.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../logging/index.js';

const TRANSLATE_SCRIPT = '/opt/aidilam-studio/runtime/translation/translate.py';
const PYTHON = 'python3';
const TIMEOUT_MS = 60_000;
const TEMP_DIR = '/tmp/aidilam-translate';

export interface TranslationSegmentInput {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranslationSegmentOutput {
  id: string;
  subtitleText: string;
  ttsText: string;
  warnings: string[];
}

export interface TranslationResult {
  segments: TranslationSegmentOutput[];
  validation: { passed: boolean; warnings: string[]; errors: string[] };
  metadata: { latencySeconds: number; segmentCount: number; requestCount: number };
}

export class GoogleTranslateFreeProvider {
  public readonly code = 'google_translate_free';
  public readonly displayName = 'Google Translate (Community)';

  async translateBatch(
    segments: TranslationSegmentInput[],
    sourceLanguage: string,
    targetLanguage: string,
    glossary?: Array<{ source: string; target: string }>,
  ): Promise<TranslationResult> {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(TEMP_DIR, { recursive: true });

    const inputPath = join(TEMP_DIR, `input-${randomUUID()}.json`);
    const outputPath = join(TEMP_DIR, `output-${randomUUID()}.json`);

    try {
      const inputData = {
        segments: segments.map(s => ({ id: s.id, text: s.text, start_ms: s.startMs, end_ms: s.endMs })),
        source_language: sourceLanguage,
        target_language: targetLanguage,
        glossary: glossary || [],
      };

      writeFileSync(inputPath, JSON.stringify(inputData, null, 2), 'utf-8');

      const stdout = execFileSync(PYTHON, [TRANSLATE_SCRIPT, inputPath, outputPath], {
        timeout: TIMEOUT_MS,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      const summary = JSON.parse(stdout.trim());
      const output = JSON.parse(readFileSync(outputPath, 'utf-8'));

      return {
        segments: (output.segments || []).map((s: any) => ({
          id: s.id,
          subtitleText: s.subtitle_text || '',
          ttsText: s.tts_text || s.subtitle_text || '',
          warnings: s.warnings || [],
        })),
        validation: output.validation || { passed: true, warnings: [], errors: [] },
        metadata: {
          latencySeconds: output.metadata?.latency_seconds || 0,
          segmentCount: output.metadata?.segment_count || segments.length,
          requestCount: output.metadata?.request_count || 1,
        },
      };
    } finally {
      try { unlinkSync(inputPath); } catch {}
      try { unlinkSync(outputPath); } catch {}
    }
  }
}
