/**
 * TTS Preview Handler — synthesizes a single text snippet and registers an audio asset.
 */
import type { JobContext } from './types.js';
import { pool } from '../infrastructure/database.js';
import { logger } from '../logging/index.js';
import { getTtsProvider, type TtsConfig } from './tts-provider.js';
import { minioClient, BUCKET } from '../infrastructure/minio.js';

export async function handleTtsPreview(context: JobContext): Promise<void> {
  const { inputPayload, projectId } = context;
  const profileId = inputPayload.profileId as string;
  const text = inputPayload.text as string;

  if (!profileId || !text) {
    throw Object.assign(new Error('Missing profileId or text in preview payload'), { retryable: false });
  }

  logger.info('TTS preview started', { jobId: context.jobId, profileId, textLength: text.length });

  // Load profile with voice and provider
  const profileRes = await pool.query(
    `SELECT tp.id, tp.speaking_rate, tp.pitch, tp.sample_rate,
            p.code AS provider_code, v.voice_code, tp.configuration_json,
            mc.cost_per_1k_characters, mc.minimum_request_charge
     FROM aidilam_app.tts_profiles tp
     JOIN aidilam_app.tts_providers p ON p.id = tp.provider_id
     JOIN aidilam_app.tts_voices v ON v.id = tp.voice_id
     LEFT JOIN aidilam_app.tts_model_configs mc ON mc.id = tp.model_config_id
     WHERE tp.id = $1`,
    [profileId],
  );

  if (profileRes.rows.length === 0) {
    throw Object.assign(new Error('Profile not found'), { retryable: false });
  }

  const profile = profileRes.rows[0];
  const provider = getTtsProvider(profile.provider_code);

  const ttsConfig: TtsConfig = {
    voiceCode: profile.voice_code,
    speakingRate: Number(profile.speaking_rate) || 1.0,
    pitch: Number(profile.pitch) || 0,
    sampleRate: Number(profile.sample_rate) || 22050,
  };

  // Synthesize
  const result = await provider.synthesizeCue(text, profile.voice_code, ttsConfig, 0);

  // Store audio
  const objectKey = `tts/${projectId}/previews/${context.jobId}.wav`;
  await minioClient.putObject(BUCKET, objectKey, result.audioBuffer, result.audioBuffer.length, {
    'Content-Type': 'audio/wav',
  });

  // Register asset
  const assetRes = await pool.query(
    `INSERT INTO aidilam_app.assets
       (project_id, bucket_name, object_key, content_type, size_bytes, status, media_kind, asset_role)
     VALUES ($1, $2, $3, 'audio/wav', $4, 'available', 'audio', 'source')
     RETURNING id`,
    [projectId, BUCKET, objectKey, result.audioBuffer.length],
  );
  const assetId = assetRes.rows[0].id;

  // Record usage - for previews, store in job result metadata instead of usage table
  // (tts_usage_records requires a tts_run_id which previews don't have)
  const cost = (text.length / 1000) * Number(profile.cost_per_1k_characters || 0.015);

  logger.info('TTS preview completed', { 
    jobId: context.jobId, assetId, durationMs: result.durationMs, 
    sizeBytes: result.audioBuffer.length, textChecksum: result.textChecksum,
    cost, characters: text.length,
  });
}
