import crypto from 'crypto';
import { logger } from '../logging/index.js';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface TtsConfig {
  voiceCode: string;
  speakingRate: number;
  pitch: number;
  sampleRate: number;
  validationScenario?: string;
}

export interface TtsSynthesisResult {
  audioBuffer: Buffer;
  durationMs: number;
  sampleRate: number;
  channels: number;
  textChecksum: string;
}

export interface TtsProvider {
  code: string;
  synthesizeCue(text: string, voiceCode: string, config: TtsConfig, cueIndex?: number): Promise<TtsSynthesisResult>;
  estimateDuration(text: string, speakingRate: number): number;
  estimateCost(characters: number, modelConfig: { costPer1kChars: number; minimumCharge: number }): number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MALE_VOICES = ['vi-VN-male-01', 'vi-VN-male-fast'];
const FEMALE_VOICES = ['vi-VN-female-01', 'vi-VN-female-calm'];

const MALE_BASE_FREQ = 220;
const FEMALE_BASE_FREQ = 440;

const SENTENCE_END_CHARS = new Set(['.', '!', '?', ';']);

const DURATION_PER_CHAR_MS = 80;
const DURATION_PER_SPACE_MS = 100;
const DURATION_PER_SENTENCE_END_MS = 200;
const MIN_DURATION_MS = 200;
const MAX_DURATION_MS = 30000;

const DEFAULT_SAMPLE_RATE = 22050;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const WAV_HEADER_SIZE = 44;

// ─── Duration Model ───────────────────────────────────────────────────────────

function calculateDurationMs(text: string, speakingRate: number): number {
  let totalMs = 0;

  for (const char of text) {
    if (char === ' ') {
      totalMs += DURATION_PER_SPACE_MS;
    } else if (SENTENCE_END_CHARS.has(char)) {
      totalMs += DURATION_PER_SENTENCE_END_MS;
    } else {
      totalMs += DURATION_PER_CHAR_MS;
    }
  }

  const rate = speakingRate > 0 ? speakingRate : 1.0;
  totalMs = totalMs / rate;

  return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, Math.round(totalMs)));
}

// ─── Voice Frequency ──────────────────────────────────────────────────────────

function getBaseFrequency(voiceCode: string): number {
  if (FEMALE_VOICES.includes(voiceCode)) {
    return FEMALE_BASE_FREQ;
  }
  return MALE_BASE_FREQ;
}

// ─── WAV Generation ──────────────────────────────────────────────────────────

function generateWavBuffer(text: string, voiceCode: string, durationMs: number, sampleRate: number): Buffer {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const dataSize = numSamples * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const fileSize = WAV_HEADER_SIZE + dataSize - 8;

  const buffer = Buffer.alloc(WAV_HEADER_SIZE + dataSize);

  // RIFF header
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8, 'ascii');

  // fmt chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(NUM_CHANNELS, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 28); // byte rate
  buffer.writeUInt16LE(NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 32); // block align
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  // Generate PCM samples with sine wave modulated by character codes
  const baseFreq = getBaseFrequency(voiceCode);
  const chars = [...text];
  const charsLength = chars.length || 1;

  for (let i = 0; i < numSamples; i++) {
    // Determine which character position maps to this sample
    const charIndex = Math.floor((i / numSamples) * charsLength) % charsLength;
    const charCode = chars[charIndex]?.codePointAt(0) ?? 0;
    const freqModulation = charCode % 50;
    const frequency = baseFreq + freqModulation;

    // Generate sine wave sample
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);

    // Convert to 16-bit PCM
    const pcmValue = Math.max(-32768, Math.min(32767, Math.round(sample * 32767 * 0.8)));
    buffer.writeInt16LE(pcmValue, WAV_HEADER_SIZE + i * 2);
  }

  return buffer;
}

function generateCorruptedWavBuffer(text: string, voiceCode: string, durationMs: number, sampleRate: number): Buffer {
  const wavBuffer = generateWavBuffer(text, voiceCode, durationMs, sampleRate);

  // Corrupt the WAV header by overwriting RIFF magic bytes
  wavBuffer.write('BAAD', 0, 'ascii');
  // Also corrupt the WAVE identifier
  wavBuffer.write('NOPE', 8, 'ascii');

  return wavBuffer;
}

// ─── Text Checksum ────────────────────────────────────────────────────────────

function computeTextChecksum(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ─── Validation Scenario Handling ─────────────────────────────────────────────

function isValidationMode(): boolean {
  return process.env.AIDILAM_VALIDATION_MODE === 'true';
}

// ─── Mock Deterministic TTS Provider ──────────────────────────────────────────

class MockDeterministicTtsProvider implements TtsProvider {
  public readonly code = 'mock_deterministic_tts';

  async synthesizeCue(
    text: string,
    voiceCode: string,
    config: TtsConfig,
    cueIndex?: number,
  ): Promise<TtsSynthesisResult> {
    const sampleRate = config.sampleRate || DEFAULT_SAMPLE_RATE;
    const speakingRate = config.speakingRate || 1.0;
    const scenario = config.validationScenario;

    // Handle validation scenarios only in validation mode
    if (isValidationMode() && scenario) {
      logger.info('TTS validation scenario active', { scenario, cueIndex, voiceCode });

      switch (scenario) {
        case 'tts_provider_failure':
          throw new Error(`[TTS_PROVIDER_FAILURE] Simulated provider failure for validation`);

        case 'tts_partial_failure':
          if (cueIndex !== undefined && cueIndex >= 2) {
            throw new Error(
              `[TTS_PARTIAL_FAILURE] Simulated partial failure at cue index ${cueIndex}`,
            );
          }
          break;

        case 'tts_slow_provider': {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          break;
        }

        case 'tts_too_long': {
          const baseDuration = calculateDurationMs(text, speakingRate);
          const longDuration = Math.min(baseDuration * 5, MAX_DURATION_MS);
          const audioBuffer = generateWavBuffer(text, voiceCode, longDuration, sampleRate);
          return {
            audioBuffer,
            durationMs: longDuration,
            sampleRate,
            channels: NUM_CHANNELS,
            textChecksum: computeTextChecksum(text),
          };
        }

        case 'tts_too_short': {
          const baseDuration = calculateDurationMs(text, speakingRate);
          const shortDuration = Math.max(Math.round(baseDuration / 10), MIN_DURATION_MS);
          const audioBuffer = generateWavBuffer(text, voiceCode, shortDuration, sampleRate);
          return {
            audioBuffer,
            durationMs: shortDuration,
            sampleRate,
            channels: NUM_CHANNELS,
            textChecksum: computeTextChecksum(text),
          };
        }

        case 'tts_invalid_audio': {
          const durationMs = calculateDurationMs(text, speakingRate);
          const audioBuffer = generateCorruptedWavBuffer(text, voiceCode, durationMs, sampleRate);
          return {
            audioBuffer,
            durationMs,
            sampleRate,
            channels: NUM_CHANNELS,
            textChecksum: computeTextChecksum(text),
          };
        }

        case 'tts_normal':
        default:
          // Fall through to normal synthesis
          break;
      }
    }

    // Normal synthesis path
    const durationMs = calculateDurationMs(text, speakingRate);
    const audioBuffer = generateWavBuffer(text, voiceCode, durationMs, sampleRate);

    return {
      audioBuffer,
      durationMs,
      sampleRate,
      channels: NUM_CHANNELS,
      textChecksum: computeTextChecksum(text),
    };
  }

  estimateDuration(text: string, speakingRate: number): number {
    return calculateDurationMs(text, speakingRate);
  }

  estimateCost(characters: number, modelConfig: { costPer1kChars: number; minimumCharge: number }): number {
    const cost = (characters / 1000) * modelConfig.costPer1kChars;
    return Math.max(cost, modelConfig.minimumCharge);
  }
}

// ─── Provider Registry ────────────────────────────────────────────────────────

const providers: Map<string, TtsProvider> = new Map();

// Register the mock deterministic provider
const mockProvider = new MockDeterministicTtsProvider();
providers.set('mock_deterministic_tts', mockProvider);

export function getTtsProvider(providerCode: string): TtsProvider {
  const provider = providers.get(providerCode);
  if (!provider) {
    throw new Error(`[ROUTING_RESOLUTION_FAILED] TTS provider not found: ${providerCode}`);
  }
  return provider;
}
