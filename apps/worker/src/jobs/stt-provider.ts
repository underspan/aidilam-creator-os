/**
 * STT Provider — Speech-to-Text provider abstraction and mock implementation
 *
 * Provides a registry of STT providers used by transcription orchestration jobs.
 * The MockDeterministicSttProvider generates deterministic word-level output
 * based on segment duration for testing without real speech recognition.
 */

// =============================================================================
// Interfaces
// =============================================================================

export interface SttSegmentInput {
  segmentId: string;
  audioPath: string;
  startMs: number;
  endMs: number;
  language?: string;
  traceId: string;
}

export interface SttWord {
  wordIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
}

export interface SttSegmentResult {
  segmentId: string;
  text: string;
  words: SttWord[];
  language: string;
  confidence: number;
}

export interface SpeechToTextProvider {
  readonly code: string;
  transcribeSegment(input: SttSegmentInput): Promise<SttSegmentResult>;
}

// =============================================================================
// Mock Deterministic Provider
// =============================================================================

/**
 * Mock Deterministic STT Provider
 *
 * Generates deterministic word-level output based on segment duration.
 * For every 2 seconds of audio, creates one word like '[mock-word-N]'.
 * Each word gets 200ms duration. Returns language 'zh' (or configured), confidence 0.95.
 *
 * In validation mode (AIDILAM_VALIDATION_MODE=true), adds a controlled delay
 * to allow observation of active processing for cancellation/restart tests.
 */
export class MockDeterministicSttProvider implements SpeechToTextProvider {
  readonly code = 'mock_deterministic';

  async transcribeSegment(input: SttSegmentInput): Promise<SttSegmentResult> {
    const durationMs = input.endMs - input.startMs;
    const wordCount = Math.max(1, Math.floor(durationMs / 2000));
    const language = input.language || 'zh';

    // Validation-mode delay: 20 seconds per segment for testing cancellation/restart
    if (process.env.AIDILAM_VALIDATION_MODE === 'true') {
      const delayMs = 20_000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const words: SttWord[] = [];
    for (let i = 0; i < wordCount; i++) {
      const wordStartMs = input.startMs + i * 2000;
      const wordEndMs = wordStartMs + 200;
      words.push({
        wordIndex: i,
        startMs: wordStartMs,
        endMs: wordEndMs,
        text: `[mock-word-${i}]`,
        confidence: 0.95,
      });
    }

    const text = words.map((w) => w.text).join(' ');

    return {
      segmentId: input.segmentId,
      text,
      words,
      language,
      confidence: 0.95,
    };
  }
}

// =============================================================================
// Provider Registry
// =============================================================================

interface ProviderRegistryEntry {
  provider: SpeechToTextProvider;
  enabled: boolean;
}

const providerRegistry: Map<string, ProviderRegistryEntry> = new Map();

// Register built-in providers
const mockProvider = new MockDeterministicSttProvider();
providerRegistry.set(mockProvider.code, { provider: mockProvider, enabled: true });

// Placeholder entries for future providers (disabled)
providerRegistry.set('openai_whisper', {
  provider: { code: 'openai_whisper', transcribeSegment: async () => { throw new Error('openai_whisper not implemented'); } },
  enabled: false,
});
providerRegistry.set('azure_speech', {
  provider: { code: 'azure_speech', transcribeSegment: async () => { throw new Error('azure_speech not implemented'); } },
  enabled: false,
});
providerRegistry.set('local_whisper', {
  provider: { code: 'local_whisper', transcribeSegment: async () => { throw new Error('local_whisper not implemented'); } },
  enabled: false,
});

/**
 * Get an STT provider by code.
 * Throws if the provider is not registered or is disabled.
 */
export function getSttProvider(code: string): SpeechToTextProvider {
  const entry = providerRegistry.get(code);
  if (!entry) {
    throw new Error(`STT provider not found: '${code}'. Available: [${Array.from(providerRegistry.keys()).join(', ')}]`);
  }
  if (!entry.enabled) {
    throw new Error(`STT provider '${code}' is registered but disabled`);
  }
  return entry.provider;
}

/**
 * List registered provider codes.
 */
export function listSttProviderCodes(): string[] {
  return Array.from(providerRegistry.keys());
}
