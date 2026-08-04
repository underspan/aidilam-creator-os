/**
 * Translation Provider — Provider abstraction and mock implementation
 *
 * Provides a registry of translation providers used by subtitle translation jobs.
 * The MockDeterministicProvider prefixes cue text with a target language marker
 * while preserving all timing and structure.
 */

export interface TranslationCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  identifier?: string;
}

export interface TranslationResult {
  cues: TranslationCue[];
}

export interface TranslationProvider {
  readonly code: string;
  readonly displayName: string;

  /**
   * Translate a batch of cues from source to target language.
   * Must preserve cue count, ordering, timing, and identifiers.
   */
  translateBatch(
    cues: TranslationCue[],
    sourceLanguage: string,
    targetLanguage: string,
    config?: Record<string, unknown>,
  ): Promise<TranslationResult>;
}

/**
 * Mock Deterministic Provider
 *
 * Prefixes each cue text with `[<targetLanguage>] ` for testing.
 * Preserves cue count, IDs, and timing exactly.
 */
export class MockDeterministicProvider implements TranslationProvider {
  readonly code = 'mock_deterministic';
  readonly displayName = 'Mock Deterministic (Testing)';

  async translateBatch(
    cues: TranslationCue[],
    _sourceLanguage: string,
    targetLanguage: string,
    config?: Record<string, unknown>,
  ): Promise<TranslationResult> {
    // Validation scenario routing (from governed profile configuration_json)
    const scenario = config?.validationScenario as string | undefined;
    if (scenario && process.env.AIDILAM_VALIDATION_MODE === 'true') {
      return this.executeValidationScenario(scenario, cues, targetLanguage);
    }

    const translatedCues: TranslationCue[] = cues.map((cue) => ({
      index: cue.index,
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: `[${targetLanguage}] ${cue.text}`,
      identifier: cue.identifier,
    }));

    return { cues: translatedCues };
  }

  private executeValidationScenario(scenario: string, cues: TranslationCue[], targetLanguage: string): TranslationResult {
    switch (scenario) {
      case 'quality_warning':
        // All cues present but with unusually long text (triggers length ratio warning)
        return { cues: cues.map(c => ({ ...c, text: `[${targetLanguage}-warn] ${c.text.repeat(5)}` })) };
      case 'quality_missing_cue':
        // Drop the last cue
        return { cues: cues.slice(0, -1).map(c => ({ ...c, text: `[${targetLanguage}] ${c.text}` })) };
      case 'quality_empty_translation':
        // First cue has empty text
        return { cues: cues.map((c, i) => ({ ...c, text: i === 0 ? '' : `[${targetLanguage}] ${c.text}` })) };
      case 'quality_glossary_violation':
        // Return source text unchanged (100% source copies = glossary violation)
        return { cues: cues.map(c => ({ ...c })) };
      case 'quality_number_changed':
        // Replace all digits with 9999
        return { cues: cues.map(c => ({ ...c, text: `[${targetLanguage}] ${c.text.replace(/\d+/g, '9999')}` })) };
      case 'quality_placeholder_changed':
        // Remove all placeholders ({...}, {{...}}, ${...}, %...%, [[...]])
        return { cues: cues.map(c => ({ ...c, text: `[${targetLanguage}] ${c.text.replace(/\{[^}]*\}|\$\{[^}]*\}|%[A-Z_]+%|\[\[[^\]]*\]\]/g, '')}` })) };
      default:
        // Unknown scenario - return normal translation
        return { cues: cues.map(c => ({ ...c, text: `[${targetLanguage}] ${c.text}` })) };
    }
  }
}

// =============================================================================
// Provider Registry
// =============================================================================

const providers: Map<string, TranslationProvider> = new Map();

// Register built-in providers
const mockProvider = new MockDeterministicProvider();
providers.set(mockProvider.code, mockProvider);

/**
 * Get a translation provider by code.
 * Throws if the provider is not registered or is disabled.
 */
export function getProvider(code: string): TranslationProvider {
  const provider = providers.get(code);
  if (!provider) {
    throw new Error(`Translation provider not found: '${code}'. Available: [${Array.from(providers.keys()).join(', ')}]`);
  }
  return provider;
}

/**
 * Register a translation provider (for extensibility).
 */
export function registerProvider(provider: TranslationProvider): void {
  providers.set(provider.code, provider);
}

/**
 * List registered provider codes.
 */
export function listProviderCodes(): string[] {
  return Array.from(providers.keys());
}
