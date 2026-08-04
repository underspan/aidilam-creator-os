/**
 * Translation Providers — Provider abstraction layer for subtitle translation
 *
 * Exports interfaces, abstract base class, concrete provider implementations,
 * and a factory function for resolving providers by code.
 */

// =============================================================================
// Interfaces
// =============================================================================

export interface TranslationBatchInput {
  cues: Array<{ cueId: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
  glossaryTerms: Array<{ sourceTerm: string; targetTerm: string; caseSensitive: boolean; matchMode: string }>;
  systemPrompt: string;
  traceId: string;
}

export interface TranslationBatchResult {
  cues: Array<{ cueId: string; translatedText: string }>;
  usage: { inputTokens: number; outputTokens: number };
}

export interface TranslationExecutionContext {
  timeout: number;
  maxRetries: number;
  abortSignal?: AbortSignal;
}

// =============================================================================
// Abstract Provider
// =============================================================================

export abstract class SubtitleTranslationProvider {
  abstract readonly code: string;
  abstract readonly displayName: string;

  /**
   * Translate a batch of cues using this provider.
   * Must preserve cue count, ordering, and identifiers.
   */
  abstract translateBatch(
    input: TranslationBatchInput,
    context: TranslationExecutionContext,
  ): Promise<TranslationBatchResult>;
}

// =============================================================================
// Mock Provider
// =============================================================================

export class MockProvider extends SubtitleTranslationProvider {
  readonly code = 'mock_deterministic';
  readonly displayName = 'Mock Deterministic (Testing)';

  async translateBatch(
    input: TranslationBatchInput,
    _context: TranslationExecutionContext,
  ): Promise<TranslationBatchResult> {
    // Validation-mode quality fault injection
    if (process.env.AIDILAM_VALIDATION_MODE === 'true' && input.traceId) {
      // Use traceId prefix to determine which scenario to produce
      if (input.traceId.startsWith('quality_warning:')) {
        // Return all cues but with unusually long translations (length ratio warning)
        return { cues: input.cues.map(c => ({ cueId: c.cueId, translatedText: '[vi-warning] ' + c.text.repeat(5) })), usage: { inputTokens: 1000, outputTokens: 600 } };
      }
      if (input.traceId.startsWith('quality_missing_cue:')) {
        // Return all cues except the last one
        return { cues: input.cues.slice(0, -1).map(c => ({ cueId: c.cueId, translatedText: '[vi] ' + c.text })), usage: { inputTokens: 1000, outputTokens: 600 } };
      }
      if (input.traceId.startsWith('quality_duplicate_cue:')) {
        // Return first cue twice, skip last
        const result = input.cues.map(c => ({ cueId: c.cueId, translatedText: '[vi] ' + c.text }));
        result.push({ cueId: input.cues[0].cueId, translatedText: '[vi-dup] ' + input.cues[0].text });
        return { cues: result, usage: { inputTokens: 1000, outputTokens: 600 } };
      }
      if (input.traceId.startsWith('quality_empty_translation:')) {
        // Return all cues but first has empty text
        return { cues: input.cues.map((c, i) => ({ cueId: c.cueId, translatedText: i === 0 ? '' : '[vi] ' + c.text })), usage: { inputTokens: 1000, outputTokens: 600 } };
      }
      if (input.traceId.startsWith('quality_glossary_violation:')) {
        // Return translations that are just source text (source copies = glossary violation)
        return { cues: input.cues.map(c => ({ cueId: c.cueId, translatedText: c.text })), usage: { inputTokens: 1000, outputTokens: 600 } };
      }
      if (input.traceId.startsWith('quality_number_changed:')) {
        // Change numbers in the text
        return { cues: input.cues.map(c => ({ cueId: c.cueId, translatedText: '[vi] ' + c.text.replace(/\d+/g, '9999') })), usage: { inputTokens: 1000, outputTokens: 600 } };
      }
      if (input.traceId.startsWith('quality_placeholder_changed:')) {
        // Remove placeholders
        return { cues: input.cues.map(c => ({ cueId: c.cueId, translatedText: '[vi] ' + c.text.replace(/\{[^}]+\}/g, '') })), usage: { inputTokens: 1000, outputTokens: 600 } };
      }
    }

    // Deterministic usage in validation mode
    if (process.env.AIDILAM_VALIDATION_MODE === 'true') {
      const translatedCues = input.cues.map((cue) => ({
        cueId: cue.cueId,
        translatedText: `[${input.targetLanguage}] ${cue.text}`,
      }));
      return {
        cues: translatedCues,
        usage: { inputTokens: 1000, outputTokens: 600 },
      };
    }

    const translatedCues = input.cues.map((cue) => ({
      cueId: cue.cueId,
      translatedText: `[${input.targetLanguage}] ${cue.text}`,
    }));

    return {
      cues: translatedCues,
      usage: {
        inputTokens: input.cues.reduce((sum, c) => sum + c.text.length, 0),
        outputTokens: translatedCues.reduce((sum, c) => sum + c.translatedText.length, 0),
      },
    };
  }
}

// =============================================================================
// Gemini Provider (stub)
// =============================================================================

export class GeminiProvider extends SubtitleTranslationProvider {
  readonly code = 'gemini';
  readonly displayName = 'Google Gemini';

  async translateBatch(
    _input: TranslationBatchInput,
    _context: TranslationExecutionContext,
  ): Promise<TranslationBatchResult> {
    throw new Error('Gemini provider is not enabled. Activate it in translation_providers configuration.');
  }
}

// =============================================================================
// Azure OpenAI Provider (stub)
// =============================================================================

export class AzureOpenAIProvider extends SubtitleTranslationProvider {
  readonly code = 'azure_openai';
  readonly displayName = 'Azure OpenAI';

  async translateBatch(
    _input: TranslationBatchInput,
    _context: TranslationExecutionContext,
  ): Promise<TranslationBatchResult> {
    throw new Error('Azure OpenAI provider is not enabled. Activate it in translation_providers configuration.');
  }
}

// =============================================================================
// OpenAI Provider (stub)
// =============================================================================

export class OpenAIProvider extends SubtitleTranslationProvider {
  readonly code = 'openai';
  readonly displayName = 'OpenAI';

  async translateBatch(
    _input: TranslationBatchInput,
    _context: TranslationExecutionContext,
  ): Promise<TranslationBatchResult> {
    throw new Error('OpenAI provider is not enabled. Activate it in translation_providers configuration.');
  }
}

// =============================================================================
// Local Model Provider (stub)
// =============================================================================

export class LocalModelProvider extends SubtitleTranslationProvider {
  readonly code = 'local_model';
  readonly displayName = 'Local Model';

  async translateBatch(
    _input: TranslationBatchInput,
    _context: TranslationExecutionContext,
  ): Promise<TranslationBatchResult> {
    throw new Error('Local model provider is not enabled. Activate it in translation_providers configuration.');
  }
}

// =============================================================================
// Provider Registry & Factory
// =============================================================================

const providerRegistry: Map<string, SubtitleTranslationProvider> = new Map();

// Register all providers
const allProviders: SubtitleTranslationProvider[] = [
  new MockProvider(),
  new GeminiProvider(),
  new AzureOpenAIProvider(),
  new OpenAIProvider(),
  new LocalModelProvider(),
];

for (const provider of allProviders) {
  providerRegistry.set(provider.code, provider);
}

/**
 * Get a translation provider by code.
 * Throws if the provider is not registered.
 */
export function getTranslationProvider(code: string): SubtitleTranslationProvider {
  const provider = providerRegistry.get(code);
  if (!provider) {
    throw new Error(
      `Translation provider not found: '${code}'. Available: [${Array.from(providerRegistry.keys()).join(', ')}]`,
    );
  }
  return provider;
}
