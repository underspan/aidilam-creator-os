/**
 * Video Render Durable Job Handler
 *
 * Renders final video by combining source with subtitles and/or TTS audio.
 * Budget reservation, FFmpeg execution with progress/cancellation, output validation.
 */
import type { JobContext } from './types.js';
import { pool } from '../infrastructure/database.js';
import { logger } from '../logging/index.js';
import { minioClient, BUCKET } from '../infrastructure/minio.js';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const FFMPEG_PATH = '/usr/bin/ffmpeg';
const FFPROBE_PATH = '/usr/bin/ffprobe';
const TEMP_BASE = '/tmp/aidilam-render';
const RESERVATION_TTL_MINUTES = 60;
const PROGRESS_INTERVAL_MS = 2000;
const FFMPEG_TIMEOUT_MS = 3_600_000;

interface RenderRun {
  id: string; project_id: string; render_profile_id: string;
  source_video_asset_id: string; subtitle_version_id: string | null;
  tts_narration_asset_id: string | null; status: string;
}
interface RenderProfile {
  id: string; mode: string; output_preset: string; output_height: number;
  video_transform_config: Record<string, unknown> | null;
  watermark_config: Record<string, unknown> | null;
  subtitle_style: SubtitleStyle | null;
}
interface SubtitleStyle {
  font_name: string; font_size: number; primary_color: string;
  outline_color: string; back_color: string; bold: boolean; italic: boolean;
  outline_width: number; shadow_depth: number; alignment: number;
  margin_v: number; margin_l: number; margin_r: number;
}
interface SourceAsset {
  id: string; object_key: string; duration_ms: number;
  width: number; height: number; frame_rate: number;
}
interface SubtitleCue { cue_index: number; start_ms: number; end_ms: number; text_plain: string; }
interface ValidationResult { valid: boolean; durationMs: number; error?: string; }

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleVideoRender(context: JobContext): Promise<void> {
  const { jobId, inputPayload } = context;
  const renderRunId = inputPayload.renderRunId as string;
  if (!renderRunId) throw createPermanentError('Missing renderRunId in inputPayload');
  logger.info('Video render started', { jobId, renderRunId });

  // Safe progress reporter with 5s timeout (prevents hanging on BullMQ/Redis issues)
  const reportProgress = async (pct: number) => {
    try { await Promise.race([context.reportProgress(pct), new Promise((_, rej) => setTimeout(() => rej(new Error('progress_timeout')), 5000))]); }
    catch { /* progress update non-critical */ }
  };

  logger.info('STAGE: loading_run', { renderRunId });
  const run = await loadRenderRun(renderRunId);
  if (!run) throw createPermanentError(`Render run not found: ${renderRunId}`);
  if (run.status !== 'queued' && run.status !== 'running' && run.status !== 'planning') {
    logger.info('Render run not actionable, skipping', { renderRunId, status: run.status });
    return;
  }

  logger.info('STAGE: transition_planning', { renderRunId });
  await pool.query(
    `UPDATE aidilam_app.render_runs SET status = 'planning', started_at = COALESCE(started_at, now()), updated_at = now() WHERE id = $1`,
    [renderRunId],
  );
  await reportProgress(5);

  const profile = await loadRenderProfile(run.render_profile_id);
  if (!profile) { await transitionRenderRunToFailed(renderRunId, 'PROFILE_NOT_FOUND', 'Render profile not found'); throw createPermanentError('Render profile not found'); }

  const sourceAsset = await loadSourceAsset(run.source_video_asset_id);
  if (!sourceAsset) { await transitionRenderRunToFailed(renderRunId, 'SOURCE_NOT_FOUND', 'Source asset not found'); throw createPermanentError('Source asset not found'); }
  await reportProgress(10);

  let cues: SubtitleCue[] = [];
  if (run.subtitle_version_id) {
    const res = await pool.query(`SELECT cue_index, start_ms, end_ms, text_plain FROM aidilam_app.subtitle_cues WHERE subtitle_version_id = $1 ORDER BY cue_index`, [run.subtitle_version_id]);
    cues = res.rows;
    if (cues.length === 0 && needsSubtitles(profile.mode)) { await transitionRenderRunToFailed(renderRunId, 'NO_CUES', 'No subtitle cues'); throw createPermanentError('No subtitle cues'); }
  }

  let ttsObjectKey: string | null = null;
  if (run.tts_narration_asset_id) {
    const res = await pool.query(`SELECT object_key FROM aidilam_app.assets WHERE id = $1 AND status = 'available'`, [run.tts_narration_asset_id]);
    ttsObjectKey = res.rows[0]?.object_key || null;
    if (!ttsObjectKey && needsTts(profile.mode)) { await transitionRenderRunToFailed(renderRunId, 'TTS_ASSET_NOT_FOUND', 'TTS asset not found'); throw createPermanentError('TTS asset not found'); }
  }
  await reportProgress(15);

  // Build render plan
  const resMult = sourceAsset.height >= 2160 ? 3.0 : sourceAsset.height >= 1080 ? 1.5 : 1.0;
  const estimatedCost = (sourceAsset.duration_ms / 1000) * 0.001 * resMult;
  await pool.query(
    `INSERT INTO aidilam_app.render_plans (render_run_id, project_id, source_video_metadata, output_spec, estimated_work_units)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (render_run_id) DO UPDATE SET estimated_work_units = EXCLUDED.estimated_work_units`,
    [renderRunId, run.project_id,
     JSON.stringify({duration_ms: sourceAsset.duration_ms, width: sourceAsset.width, height: sourceAsset.height}),
     JSON.stringify({mode: profile.mode, height: profile.output_height, preset: profile.output_preset}),
     estimatedCost],
  );
  await reportProgress(18);

  // Budget reservation
  let reservationId: string | null = null;
  try { reservationId = await reserveBudget(run.project_id, renderRunId, estimatedCost); }
  catch (err) { await transitionRenderRunToFailed(renderRunId, 'BUDGET_EXCEEDED', err instanceof Error ? err.message : 'Budget check failed'); throw err; }

  await pool.query(`UPDATE aidilam_app.render_runs SET status = 'running', updated_at = now() WHERE id = $1`, [renderRunId]);
  await reportProgress(22);

  const tempDir = join(TEMP_BASE, renderRunId);
  try {
    mkdirSync(tempDir, { recursive: true });
    const sourcePath = join(tempDir, 'source.mp4');
    logger.info("STAGE: downloading_source", { renderRunId }); await downloadFromMinio(sourceAsset.object_key, sourcePath); logger.info("STAGE: source_downloaded", { renderRunId });
    logger.info("STAGE: progress_30_start", { renderRunId });
    await reportProgress(30);
    logger.info("STAGE: progress_30_done", { renderRunId });

    let assPath: string | null = null;
    if (cues.length > 0 && needsSubtitles(profile.mode)) {
      logger.info("STAGE: writing_ass", { renderRunId });
      assPath = join(tempDir, 'subtitles.ass');
      writeFileSync(assPath, generateAssFile(cues, profile.subtitle_style), 'utf-8');
    }

    let narrationPath: string | null = null;
    if (ttsObjectKey && needsTts(profile.mode)) {
      logger.info("STAGE: downloading_narration", { renderRunId });
      narrationPath = join(tempDir, 'narration.wav');
      await downloadFromMinio(ttsObjectKey, narrationPath);
    }
    logger.info("STAGE: progress_38_start", { renderRunId });
    await reportProgress(38);
    logger.info("STAGE: progress_38_done", { renderRunId });

    // Download watermark if configured
    logger.info("STAGE: watermark_check", { renderRunId, hasVtc: !!profile.video_transform_config, hasWmConfig: !!profile.watermark_config });
    const vtc = profile.video_transform_config ? { ...profile.video_transform_config } : null;
    if (vtc && profile.watermark_config && (profile.watermark_config as Record<string, unknown>).assetId) {
      logger.info("STAGE: watermark_downloading", { renderRunId });
      const wmConfig = profile.watermark_config as Record<string, unknown>;
      const wmAsset = await pool.query("SELECT object_key FROM aidilam_app.assets WHERE id = $1 AND project_id = $2", [wmConfig.assetId, run.project_id]);
      if (wmAsset.rows[0]) {
        const wmPath = join(tempDir, 'watermark.png');
        await downloadFromMinio(wmAsset.rows[0].object_key, wmPath);
        logger.info("STAGE: watermark_downloaded", { renderRunId });
        vtc.watermarkPath = wmPath;
        vtc.watermarkPosition = wmConfig.position || 'bottom_right';
        vtc.watermarkOpacity = wmConfig.opacity || 0.7;
        vtc.watermarkMargin = wmConfig.margin || 10;
      }
    } else if (profile.watermark_config && (profile.watermark_config as Record<string, unknown>).assetId) {
      // vtc was null but watermark config exists - create vtc
      logger.info("STAGE: watermark_vtc_null_creating", { renderRunId });
      const wmConfig = profile.watermark_config as Record<string, unknown>;
      const wmAsset = await pool.query("SELECT object_key FROM aidilam_app.assets WHERE id = $1 AND project_id = $2", [wmConfig.assetId, run.project_id]);
      if (wmAsset.rows[0]) {
        const wmPath = join(tempDir, 'watermark.png');
        await downloadFromMinio(wmAsset.rows[0].object_key, wmPath);
        logger.info("STAGE: watermark_downloaded_no_vtc", { renderRunId });
      }
    }
    logger.info("STAGE: pre_ffmpeg", { renderRunId, hasWatermark: !!vtc?.watermarkPath });

    // Validation scenario routing (server-controlled failure injection)
    const scenario = vtc?.validationScenario as string | undefined;
    if (scenario && process.env.AIDILAM_VALIDATION_MODE === 'true') {
      logger.info('Render validation scenario active', { renderRunId, scenario });
      switch (scenario) {
        case 'render_invalid_source':
          await transitionRenderRunToFailed(renderRunId, 'INVALID_SOURCE', 'Source validation failed (simulated)');
          throw createPermanentError('render_invalid_source');
        case 'render_ffmpeg_failure':
          // Inject server-owned invalid codec to cause deterministic FFmpeg failure
          if (vtc) { vtc._forceInvalidCodec = true; } else { /* vtc null handled below */ }
          break;
        case 'render_invalid_subtitle':
          await transitionRenderRunToFailed(renderRunId, 'INVALID_SUBTITLE', 'Subtitle validation failed (simulated)');
          throw createPermanentError('render_invalid_subtitle');
        case 'render_invalid_tts_audio':
          await transitionRenderRunToFailed(renderRunId, 'INVALID_TTS_AUDIO', 'TTS audio validation failed (simulated)');
          throw createPermanentError('render_invalid_tts_audio');
        case 'render_timeout':
          await transitionRenderRunToFailed(renderRunId, 'RENDER_TIMEOUT', 'Render timeout (simulated)');
          throw createPermanentError('render_timeout');
        case 'render_output_validation_failure':
          // Will handle after FFmpeg
          break;
        case 'render_upload_failure':
          // Will handle after output validation
          break;
        default:
          break;
      }
    }

    const outputPath = join(tempDir, 'output.mp4');
    const ffmpegArgs = buildFfmpegArgs(profile.mode, sourcePath, outputPath, assPath, narrationPath, profile.output_preset, vtc);

    let cancelled = false;
    try {
      await executeFfmpeg(ffmpegArgs, sourceAsset.duration_ms, async (pct) => {
        await reportProgress(38 + Math.round(pct * 0.42));
      }, async () => {
        const r = await pool.query(`SELECT status FROM aidilam_app.render_runs WHERE id = $1`, [renderRunId]);
        if (r.rows[0]?.status === 'cancel_requested') { cancelled = true; return true; }
        return false;
      });
    } catch (err) {
      if (cancelled) { await handleCancellation(renderRunId, reservationId); return; }
      const msg = err instanceof Error ? err.message : 'FFmpeg failed';
      await transitionRenderRunToFailed(renderRunId, 'FFMPEG_FAILED', msg);
      throw createPermanentError(msg);
    }
    if (cancelled) { await handleCancellation(renderRunId, reservationId); return; }
    await reportProgress(82);

    const validation = await validateOutput(outputPath);
    if (!validation.valid) { await transitionRenderRunToFailed(renderRunId, 'INVALID_OUTPUT', validation.error!); throw createPermanentError(validation.error!); }

    // Validation scenario: output validation failure (after FFmpeg succeeded)
    if (scenario === 'render_output_validation_failure' && process.env.AIDILAM_VALIDATION_MODE === 'true') {
      await transitionRenderRunToFailed(renderRunId, 'OUTPUT_VALIDATION_FAILED', 'Output validation failed (simulated)');
      throw createPermanentError('render_output_validation_failure');
    }

    const outputBuf = readFileSync(outputPath);
    const outputSize = outputBuf.length;
    const outputChecksum = createHash('sha256').update(outputBuf).digest('hex');
    const outputKey = `renders/${run.project_id}/${renderRunId}/output.mp4`;

    // Validation scenario: upload failure
    if (scenario === 'render_upload_failure' && process.env.AIDILAM_VALIDATION_MODE === 'true') {
      await transitionRenderRunToFailed(renderRunId, 'UPLOAD_FAILED', 'Upload failed (simulated)');
      throw createPermanentError('render_upload_failure');
    }

    await minioClient.putObject(BUCKET, outputKey, outputBuf, outputSize, { 'Content-Type': 'video/mp4' });
    await reportProgress(90);

    const assetId = await registerAsset(run.project_id, outputKey, outputSize, outputChecksum);
    await pool.query(
      `INSERT INTO aidilam_app.render_usage_records (project_id, render_run_id, source_duration_ms, output_duration_ms, output_bytes, estimated_cost, committed_cost, currency) VALUES ($1,$2,$3,$4,$5,$6,$7,'USD') ON CONFLICT (render_run_id) DO UPDATE SET output_duration_ms=EXCLUDED.output_duration_ms, output_bytes=EXCLUDED.output_bytes, committed_cost=EXCLUDED.committed_cost`,
      [run.project_id, renderRunId, sourceAsset.duration_ms, validation.durationMs, outputSize, estimatedCost, estimatedCost],
    );
    if (reservationId) {
      await pool.query(`UPDATE aidilam_app.render_budget_reservations SET status = 'committed', committed_amount = $2, updated_at = now() WHERE id = $1`, [reservationId, estimatedCost]);
    }
    await pool.query(
      `UPDATE aidilam_app.render_runs SET status = 'succeeded', output_asset_id = $2, actual_duration_ms = $3, committed_cost = $4, completed_at = now(), progress_percent = 100, updated_at = now() WHERE id = $1`,
      [renderRunId, assetId, validation.durationMs, estimatedCost],
    );
    await reportProgress(100);
    logger.info('Video render completed', { jobId, renderRunId, mode: profile.mode, durationMs: validation.durationMs, outputSize });
  } finally {
    try { if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  }
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

async function loadRenderRun(id: string): Promise<RenderRun | null> {
  const r = await pool.query(`SELECT id, project_id, render_profile_id, source_video_asset_id, subtitle_version_id, tts_narration_asset_id, status FROM aidilam_app.render_runs WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function loadRenderProfile(id: string): Promise<RenderProfile | null> {
  const r = await pool.query(
    `SELECT rp.id, rp.mode, rp.video_codec, rp.audio_codec, rp.width, rp.height, rp.frame_rate,
            rp.audio_sample_rate, rp.audio_channels, rp.original_audio_policy,
            rp.original_audio_gain, rp.tts_audio_gain, rp.normalization_policy,
            rp.video_transform_config, rp.watermark_config,
            ss.font_family, ss.font_size, ss.font_weight, ss.primary_color, ss.outline_color,
            ss.outline_width, ss.shadow, ss.alignment, ss.margin_left, ss.margin_right,
            ss.margin_vertical, ss.background_enabled, ss.background_color, ss.max_lines
     FROM aidilam_app.render_profiles rp
     LEFT JOIN aidilam_app.subtitle_styles ss ON ss.id = rp.subtitle_style_id
     WHERE rp.id = $1`, [id]);
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: row.id, mode: row.mode, output_preset: 'fast',
    output_height: Number(row.height) || 720,
    video_transform_config: row.video_transform_config || null,
    watermark_config: row.watermark_config || null,
    subtitle_style: row.font_family ? {
      font_name: row.font_family, font_size: Number(row.font_size) || 24,
      primary_color: row.primary_color || '&H00FFFFFF', outline_color: row.outline_color || '&H00000000',
      back_color: row.background_color || '&H80000000', bold: row.font_weight === 'bold', italic: false,
      outline_width: Number(row.outline_width) || 2, shadow_depth: Number(row.shadow) || 1,
      alignment: Number(row.alignment) || 2, margin_v: Number(row.margin_vertical) || 30,
      margin_l: Number(row.margin_left) || 20, margin_r: Number(row.margin_right) || 20,
    } : null,
  };
}

async function loadSourceAsset(id: string): Promise<SourceAsset | null> {
  const r = await pool.query(`SELECT id, object_key, duration_ms, width, height, frame_rate FROM aidilam_app.assets WHERE id = $1 AND status = 'available'`, [id]);
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return { id: row.id, object_key: row.object_key, duration_ms: Number(row.duration_ms) || 0, width: Number(row.width) || 1920, height: Number(row.height) || 1080, frame_rate: Number(row.frame_rate) || 30 };
}

// ─── Budget Reservation ───────────────────────────────────────────────────────

async function reserveBudget(projectId: string, renderRunId: string, cost: number): Promise<string | null> {
  if (cost <= 0) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bRes = await client.query(`SELECT per_run_limit, daily_limit, monthly_limit FROM aidilam_app.render_budgets WHERE project_id = $1 AND is_active = true FOR UPDATE`, [projectId]);
    if (bRes.rows.length > 0) {
      const b = bRes.rows[0];
      if (b.per_run_limit !== null && cost > Number(b.per_run_limit)) {
        await client.query('ROLLBACK');
        throw createPermanentError(`RENDER_BUDGET_EXCEEDED: cost $${cost.toFixed(4)} > per-run limit $${b.per_run_limit}`);
      }
      if (b.daily_limit !== null) {
        const d = await client.query(`SELECT COALESCE(SUM(committed_cost),0) + COALESCE((SELECT SUM(estimated_amount) FROM aidilam_app.render_budget_reservations WHERE project_id=$1 AND status='reserved' AND created_at>=CURRENT_DATE),0) as total FROM aidilam_app.render_usage_records WHERE project_id=$1 AND created_at>=CURRENT_DATE`, [projectId]);
        if (Number(d.rows[0].total) + cost > Number(b.daily_limit)) {
          await client.query('ROLLBACK');
          throw createPermanentError(`RENDER_BUDGET_EXCEEDED: daily limit would be exceeded`);
        }
      }
      if (b.monthly_limit !== null) {
        const m = await client.query(`SELECT COALESCE(SUM(committed_cost),0) + COALESCE((SELECT SUM(estimated_amount) FROM aidilam_app.render_budget_reservations WHERE project_id=$1 AND status='reserved' AND created_at>=date_trunc('month',CURRENT_DATE)),0) as total FROM aidilam_app.render_usage_records WHERE project_id=$1 AND created_at>=date_trunc('month',CURRENT_DATE)`, [projectId]);
        if (Number(m.rows[0].total) + cost > Number(b.monthly_limit)) {
          await client.query('ROLLBACK');
          throw createPermanentError(`RENDER_BUDGET_EXCEEDED: monthly limit would be exceeded`);
        }
      }
    }
    const res = await client.query(
      `INSERT INTO aidilam_app.render_budget_reservations (project_id, render_run_id, currency, estimated_amount, status, expires_at) VALUES ($1,$2,'USD',$3,'reserved',now()+interval '${RESERVATION_TTL_MINUTES} minutes') ON CONFLICT (render_run_id) DO UPDATE SET estimated_amount=EXCLUDED.estimated_amount, status='reserved', expires_at=EXCLUDED.expires_at, updated_at=now() RETURNING id`,
      [projectId, renderRunId, cost]);
    await client.query('COMMIT');
    return res.rows[0]?.id || null;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally { client.release(); }
}

// ─── ASS Subtitle Generator ──────────────────────────────────────────────────

function generateAssFile(cues: SubtitleCue[], style: SubtitleStyle | null): string {
  const s = style || { font_name: 'Arial', font_size: 24, primary_color: '&H00FFFFFF', outline_color: '&H00000000', back_color: '&H80000000', bold: false, italic: false, outline_width: 2, shadow_depth: 1, alignment: 2, margin_v: 30, margin_l: 20, margin_r: 20 };
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080',
    'WrapStyle: 0', 'ScaledBorderAndShadow: yes', 'YCbCr Matrix: TV.709', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${s.font_name},${s.font_size},${s.primary_color},&H000000FF,${s.outline_color},${s.back_color},${s.bold ? -1 : 0},${s.italic ? -1 : 0},0,0,100,100,0,0,1,${s.outline_width},${s.shadow_depth},${s.alignment},${s.margin_l},${s.margin_r},${s.margin_v},1`,
    '', '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  for (const cue of cues) {
    const text = cue.text_plain.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
    lines.push(`Dialogue: 0,${msToAss(cue.start_ms)},${msToAss(cue.end_ms)},Default,,0,0,0,,${text}`);
  }
  return lines.join('\n') + '\n';
}

function msToAss(ms: number): string {
  const t = ms / 1000;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ─── FFmpeg Args Builder ──────────────────────────────────────────────────────

function buildFfmpegArgs(mode: string, src: string, out: string, ass: string | null, narr: string | null, preset: string, vtc: Record<string, unknown> | null): string[] {
  const args = ['-y', '-v', 'error', '-progress', 'pipe:2'];
  switch (mode) {
    case 'subtitle_only':
      args.push('-i', src, '-vf', `ass=${ass}`, '-c:v', 'libx264', '-preset', preset, '-c:a', 'copy', out);
      break;
    case 'tts_replace_audio':
      args.push('-i', src, '-i', narr!, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', preset, '-c:a', 'aac', out);
      break;
    case 'tts_mix_audio':
      args.push('-i', src, '-i', narr!, '-filter_complex', '[0:a]volume=0.3[orig];[1:a]volume=1.0[tts];[orig][tts]amix=inputs=2:duration=longest', '-c:v', 'libx264', '-preset', preset, '-c:a', 'aac', out);
      break;
    case 'video_transform_only': {
      const vf = buildVtFilter(vtc);
      const af = buildAudioFilter(vtc);
      // Check for watermark
      if (vtc?.watermarkPath) {
        args.push('-filter_complex_threads', '1', '-i', src, '-i', vtc.watermarkPath as string);
        const pos = vtc.watermarkPosition || 'bottom_right';
        const margin = Number(vtc.watermarkMargin) || 10;
        const opacity = Number(vtc.watermarkOpacity) || 0.7;
        let overlayPos = `main_w-overlay_w-${margin}:main_h-overlay_h-${margin}`; // bottom_right
        if (pos === 'top_left') overlayPos = `${margin}:${margin}`;
        else if (pos === 'top_right') overlayPos = `main_w-overlay_w-${margin}:${margin}`;
        else if (pos === 'bottom_left') overlayPos = `${margin}:main_h-overlay_h-${margin}`;
        else if (pos === 'center') overlayPos = `(main_w-overlay_w)/2:(main_h-overlay_h)/2`;
        const vfParts: string[] = [];
        if (vf) vfParts.push(`[0:v]${vf}[vtmp]`);
        const baseLabel = vf ? '[vtmp]' : '[0:v]';
        if (opacity < 1.0) {
          vfParts.push(`[1:v]format=rgba,colorchannelmixer=aa=${opacity}[wm]`);
          vfParts.push(`${baseLabel}[wm]overlay=x=${overlayPos.split(':')[0]}:y=${overlayPos.split(':')[1]}`);
        } else {
          vfParts.push(`${baseLabel}[1:v]overlay=x=${overlayPos.split(':')[0]}:y=${overlayPos.split(':')[1]}`);
        }
        args.push('-filter_complex', vfParts.join(';'));
        if (af) args.push('-af', af); else args.push('-c:a', 'copy');
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out);
      } else {
        args.push('-i', src);
        if (vf) args.push('-vf', vf);
        if (af) args.push('-af', af); else args.push('-c:a', 'copy');
        args.push('-c:v', vtc?._forceInvalidCodec ? 'aidilam_invalid_codec_validation' : 'libx264', '-preset', preset, '-threads', '1', '-pix_fmt', 'yuv420p', out);
      }
      break;
    }
    case 'subtitle_and_tts':
      args.push('-i', src, '-i', narr!, '-filter_complex', `[0:v]ass=${ass}[vout];[0:a]volume=0.3[orig];[1:a]volume=1.0[tts];[orig][tts]amix=inputs=2:duration=longest[aout]`, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', preset, '-c:a', 'aac', out);
      break;
    default:
      throw createPermanentError(`Unknown render mode: ${mode}`);
  }
  return args;
}

function buildVtFilter(config: Record<string, unknown> | null): string | null {
  if (!config) return null;
  const f: string[] = [];
  if (config.scale) { const { width: w, height: h } = config.scale as { width: number; height: number }; f.push(`scale=${w}:${h}`); }
  if (config.aspectPolicy === 'fit_with_pad' && config.targetWidth && config.targetHeight) {
    f.push(`scale=${config.targetWidth}:${config.targetHeight}:force_original_aspect_ratio=decrease`);
    f.push(`pad=${config.targetWidth}:${config.targetHeight}:(ow-iw)/2:(oh-ih)/2`);
  }
  if (config.crop) { const { w, h, x, y } = config.crop as { w: number; h: number; x: number; y: number }; f.push(`crop=${w}:${h}:${x}:${y}`); }
  if (config.horizontalFlip === true) f.push('hflip');
  if (typeof config.brightness === 'number' || typeof config.contrast === 'number') {
    const b = typeof config.brightness === 'number' ? config.brightness : 0;
    const c = typeof config.contrast === 'number' ? config.contrast : 1;
    f.push(`eq=brightness=${b}:contrast=${c}`);
  }
  if (typeof config.speed === 'number' && config.speed !== 1.0) {
    const s = Math.max(0.75, Math.min(1.5, config.speed as number));
    f.push(`setpts=PTS/${s}`);
  }
  if (config.rotate) f.push(`rotate=${config.rotate as number}*PI/180`);
  return f.length > 0 ? f.join(',') : null;
}

function buildAudioFilter(config: Record<string, unknown> | null): string | null {
  if (!config) return null;
  const f: string[] = [];
  if (typeof config.speed === 'number' && config.speed !== 1.0) {
    const s = Math.max(0.75, Math.min(1.5, config.speed as number));
    f.push(`atempo=${s}`);
  }
  return f.length > 0 ? f.join(',') : null;
}

// ─── FFmpeg Executor ──────────────────────────────────────────────────────────

function executeFfmpeg(args: string[], totalMs: number, onProgress: (pct: number) => Promise<void>, checkCancel: () => Promise<boolean>): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin' } });
    let stderr = '';
    let lastUpdate = 0;
    let timeoutH = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('FFmpeg timeout')); }, FFMPEG_TIMEOUT_MS);
    const resetT = () => { clearTimeout(timeoutH); timeoutH = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('FFmpeg timeout')); }, FFMPEG_TIMEOUT_MS); };

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (stderr.length < 8192) stderr += text;
      const match = text.match(/out_time_ms=(\d+)/);
      if (match && totalMs > 0) {
        const pct = Math.min(100, Math.round((parseInt(match[1], 10) / 1000 / totalMs) * 100));
        const now = Date.now();
        if (now - lastUpdate >= PROGRESS_INTERVAL_MS) {
          lastUpdate = now; resetT();
          void (async () => { await onProgress(pct); if (await checkCancel()) proc.kill('SIGTERM'); })();
        }
      }
    });
    proc.on('error', (e) => { clearTimeout(timeoutH); reject(new Error(`FFmpeg spawn: ${e.message}`)); });
    proc.on('close', (code, signal) => {
      clearTimeout(timeoutH);
      if (signal === 'SIGTERM') { reject(new Error('FFmpeg cancelled')); return; }
      if (code !== 0) { reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(0, 500)}`)); return; }
      resolve();
    });
  });
}

// ─── Output Validation ────────────────────────────────────────────────────────

function validateOutput(outputPath: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
      resolve({ valid: false, durationMs: 0, error: 'Output file missing or empty' }); return;
    }
    const args = ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', outputPath];
    let stdout = '';
    const proc = spawn(FFPROBE_PATH, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin' } });
    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
    proc.on('error', () => resolve({ valid: false, durationMs: 0, error: 'ffprobe spawn failed' }));
    proc.on('close', (code) => {
      if (code !== 0) { resolve({ valid: false, durationMs: 0, error: `ffprobe exit ${code}` }); return; }
      try {
        const data = JSON.parse(stdout);
        const dur = parseFloat(data.format?.duration);
        const durationMs = !isNaN(dur) ? Math.round(dur * 1000) : 0;
        const hasVideo = (data.streams || []).some((s: { codec_type: string }) => s.codec_type === 'video');
        if (!hasVideo) { resolve({ valid: false, durationMs, error: 'No video stream' }); return; }
        if (durationMs <= 0) { resolve({ valid: false, durationMs, error: 'Zero duration' }); return; }
        resolve({ valid: true, durationMs });
      } catch { resolve({ valid: false, durationMs: 0, error: 'ffprobe parse failed' }); }
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function downloadFromMinio(key: string, dest: string): Promise<void> {
  const stream = await minioClient.getObject(BUCKET, key);
  return new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { stream.destroy(); reject(new Error('Download timeout')); }, 60000);
    stream.on('data', (chunk: Buffer) => { chunks.push(chunk); });
    stream.on('end', () => { clearTimeout(timer); writeFileSync(dest, Buffer.concat(chunks)); resolve(); });
    stream.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
  });
}

async function registerAsset(projectId: string, key: string, size: number, checksum: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO aidilam_app.assets (project_id, bucket_name, object_key, content_type, size_bytes, checksum_sha256, status, media_kind, asset_role) VALUES ($1,$2,$3,'video/mp4',$4,$5,'available','video','derived') RETURNING id`,
    [projectId, BUCKET, key, size, checksum]);
  return r.rows[0].id;
}

function needsSubtitles(mode: string): boolean { return mode === 'subtitle_only' || mode === 'subtitle_and_tts'; }
function needsTts(mode: string): boolean { return mode === 'tts_replace_audio' || mode === 'tts_mix_audio' || mode === 'subtitle_and_tts'; }

// ─── Cancellation & Failure ───────────────────────────────────────────────────

async function handleCancellation(renderRunId: string, reservationId: string | null): Promise<void> {
  logger.info('Render run cancelled', { renderRunId });
  if (reservationId) {
    await pool.query(`UPDATE aidilam_app.render_budget_reservations SET status='released', updated_at=now() WHERE id=$1 AND status='reserved'`, [reservationId]).catch(() => {});
  }
  await pool.query(`UPDATE aidilam_app.render_runs SET status='cancelled', cancelled_at=now(), updated_at=now() WHERE id=$1`, [renderRunId]);
}

async function transitionRenderRunToFailed(renderRunId: string, code: string, message: string): Promise<void> {
  logger.error('Render run failed', { renderRunId, code, message });
  await pool.query(`UPDATE aidilam_app.render_budget_reservations SET status='released', updated_at=now() WHERE render_run_id=$1 AND status='reserved'`, [renderRunId]).catch(() => {});
  await pool.query(`UPDATE aidilam_app.render_runs SET status='failed', error_code=$2, error_message_safe=$3, completed_at=now(), updated_at=now() WHERE id=$1`, [renderRunId, code, message]);
}

function createPermanentError(message: string): Error & { retryable: boolean } {
  const err = new Error(message) as Error & { retryable: boolean };
  err.retryable = false;
  return err;
}
