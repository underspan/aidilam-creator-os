/**
 * Provider Resolver and Adapter Registry
 * AIDILAM-COM-04B2
 *
 * All pipeline stages resolve providers through this module.
 * No business logic may directly choose a provider implementation.
 */
import { pool } from '../infrastructure/database.js';
import { LocalWhisperProvider } from './real-stt-provider.js';
import { GoogleTranslateFreeProvider } from './real-translation-provider.js';
import { EdgeTtsProvider } from './real-tts-provider.js';
import { FfmpegRenderAdapter } from './render-adapter.js';
import { logger } from '../logging/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type Capability = 'stt' | 'translation' | 'tts' | 'render';

export interface ResolvedProvider {
  providerId: string;
  providerCode: string;
  capability: Capability;
  classification: string;
  adapterKey: string;
  enabled: boolean;
  resolutionSource: 'workspace_default' | 'explicit' | 'system_fallback';
  workspaceId: string;
}

export interface ResolveInput {
  workspaceId: string;
  projectId?: string;
  capability: Capability;
  requestedProviderId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provider Resolver
// ═══════════════════════════════════════════════════════════════════════════════

export async function resolveProvider(input: ResolveInput): Promise<ResolvedProvider> {
  const { workspaceId, capability, requestedProviderId } = input;

  // If explicit provider requested, verify it's enabled for this workspace
  if (requestedProviderId) {
    const explicit = await pool.query(
      `SELECT wpc.provider_id, pd.code, pd.provider_type, wpc.enabled
       FROM aidilam_app.workspace_provider_configs wpc
       JOIN aidilam_app.provider_definitions pd ON pd.id = wpc.provider_id
       WHERE wpc.workspace_id = $1 AND wpc.provider_id = $2 AND wpc.capability = $3`,
      [workspaceId, requestedProviderId, capability]
    );
    if (explicit.rows.length > 0 && explicit.rows[0].enabled) {
      return {
        providerId: explicit.rows[0].provider_id,
        providerCode: explicit.rows[0].code,
        capability,
        classification: explicit.rows[0].provider_type,
        adapterKey: explicit.rows[0].code,
        enabled: true,
        resolutionSource: 'explicit',
        workspaceId,
      };
    }
    if (explicit.rows.length > 0 && !explicit.rows[0].enabled) {
      throw new Error(`Provider ${requestedProviderId} is disabled for capability ${capability} in this workspace`);
    }
  }

  // Workspace default
  const defaultRes = await pool.query(
    `SELECT wpc.provider_id, pd.code, pd.provider_type, wpc.enabled
     FROM aidilam_app.workspace_provider_configs wpc
     JOIN aidilam_app.provider_definitions pd ON pd.id = wpc.provider_id
     WHERE wpc.workspace_id = $1 AND wpc.capability = $2 AND wpc.is_default = true AND wpc.enabled = true`,
    [workspaceId, capability]
  );

  if (defaultRes.rows.length > 0) {
    return {
      providerId: defaultRes.rows[0].provider_id,
      providerCode: defaultRes.rows[0].code,
      capability,
      classification: defaultRes.rows[0].provider_type,
      adapterKey: defaultRes.rows[0].code,
      enabled: true,
      resolutionSource: 'workspace_default',
      workspaceId,
    };
  }

  // Fail closed — no provider available
  throw new Error(`No enabled default provider for capability '${capability}' in workspace ${workspaceId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Registry (maps providerCode → implementation)
// ═══════════════════════════════════════════════════════════════════════════════

const sttAdapters: Record<string, () => LocalWhisperProvider> = {
  faster_whisper: () => new LocalWhisperProvider(),
};

const translationAdapters: Record<string, () => GoogleTranslateFreeProvider> = {
  google_translate_free: () => new GoogleTranslateFreeProvider(),
};

const ttsAdapters: Record<string, () => EdgeTtsProvider> = {
  edge_tts: () => new EdgeTtsProvider(),
};

const renderAdapters: Record<string, () => FfmpegRenderAdapter> = {
  ffmpeg: () => new FfmpegRenderAdapter(),
};

export function getSttAdapter(providerCode: string): LocalWhisperProvider {
  const factory = sttAdapters[providerCode];
  if (!factory) throw new Error(`Unknown STT adapter: ${providerCode}`);
  return factory();
}

export function getTranslationAdapter(providerCode: string): GoogleTranslateFreeProvider {
  const factory = translationAdapters[providerCode];
  if (!factory) throw new Error(`Unknown translation adapter: ${providerCode}`);
  return factory();
}

export function getTtsAdapter(providerCode: string): EdgeTtsProvider {
  const factory = ttsAdapters[providerCode];
  if (!factory) throw new Error(`Unknown TTS adapter: ${providerCode}`);
  return factory();
}

export function getRenderAdapter(providerCode: string): FfmpegRenderAdapter {
  const factory = renderAdapters[providerCode];
  if (!factory) throw new Error(`Unknown render adapter: ${providerCode}`);
  return factory();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Workspace Lookup Helper
// ═══════════════════════════════════════════════════════════════════════════════

export async function getWorkspaceIdForProject(projectId: string): Promise<string> {
  const res = await pool.query(
    `SELECT workspace_id FROM aidilam_app.projects WHERE id = $1`,
    [projectId]
  );
  if (res.rows.length === 0) throw new Error(`Project ${projectId} not found`);
  return res.rows[0].workspace_id;
}
