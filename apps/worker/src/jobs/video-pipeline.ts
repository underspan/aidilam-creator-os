/**
 * Video Pipeline Orchestrator
 * AIDILAM-VIDEOMVP-006
 *
 * Chains: Ingest → Analysis → STT → Translation → TTS → Render → QC → Review
 * All stages use real providers (no mock fallback in production mode).
 */
import type { JobContext } from './types.js';
import { pool } from '../infrastructure/database.js';
import { minioClient, BUCKET } from '../infrastructure/minio.js';
import { logger } from '../logging/index.js';
import { resolveProvider, getSttAdapter, getTranslationAdapter, getTtsAdapter, getRenderAdapter, getWorkspaceIdForProject } from './provider-resolver.js';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const TEMP_BASE = '/tmp/aidilam-pipeline';

interface PipelineInput {
  projectId: string;
  sourceAssetId: string;
  sourceLanguage: string;
  targetLanguage: string;
  voiceCode: string;
  outputWidth: number;
  outputHeight: number;
}

export async function handleVideoPipeline(context: JobContext): Promise<Record<string, unknown>> {
  const { jobId, inputPayload, reportProgress, checkCancellation } = context;
  const input = inputPayload as unknown as PipelineInput;
  const { projectId, sourceAssetId, sourceLanguage, targetLanguage, voiceCode } = input;
  const width = input.outputWidth || 1080;
  const height = input.outputHeight || 1920;

  const workDir = join(TEMP_BASE, jobId);
  mkdirSync(workDir, { recursive: true });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // Stage 1: Download source from MinIO
    // ═══════════════════════════════════════════════════════════════════════
    await reportProgress(5);
    await checkCancellation();
    await updateJobStage(jobId, 'ingesting');

    const asset = await pool.query(
      `SELECT object_key, size_bytes FROM aidilam_app.assets WHERE id = $1 AND project_id = $2 AND status = 'available'`,
      [sourceAssetId, projectId]
    );
    if (asset.rows.length === 0) throw new Error('Source asset not found or unavailable');

    const sourcePath = join(workDir, 'source.mp4');
    await minioClient.fGetObject(BUCKET, asset.rows[0].object_key, sourcePath);
    logger.info('Source downloaded', { jobId, size: asset.rows[0].size_bytes });

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 2: Media Analysis (ffprobe)
    // ═══════════════════════════════════════════════════════════════════════
    await reportProgress(10);
    await checkCancellation();
    await updateJobStage(jobId, 'media_analyzed');

    // Resolve workspace early for all provider lookups
    const workspaceId = await getWorkspaceIdForProject(projectId);
    const probeAdapter = getRenderAdapter((await resolveProvider({ workspaceId, projectId, capability: 'render' })).providerCode);
    const probe = probeAdapter.probe(sourcePath);
    const duration = parseFloat(probe.format?.duration || '0');
    logger.info('Media analyzed', { jobId, duration });

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 3: Audio Extraction
    // ═══════════════════════════════════════════════════════════════════════
    await reportProgress(15);
    await checkCancellation();
    await updateJobStage(jobId, 'audio_extracted');

    const audioPath = join(workDir, 'audio.wav');
    // Use already-resolved render adapter for audio extraction
    probeAdapter.extractAudio(sourcePath, audioPath);

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 4: Real STT (faster-whisper)
    // ═══════════════════════════════════════════════════════════════════════
    await reportProgress(25);
    await checkCancellation();
    await updateJobStage(jobId, 'transcribing');

    // Resolve STT provider through workspace registry
    const sttResolved = await resolveProvider({ workspaceId, projectId, capability: 'stt' });
    const sttProvider = getSttAdapter(sttResolved.providerCode);
    logger.info('STT provider resolved', { jobId, provider: sttResolved.providerCode, source: sttResolved.resolutionSource });
    const sttResult = await sttProvider.transcribeSegment({
      segmentId: 'full',
      audioPath,
      startMs: 0,
      endMs: Math.round(duration * 1000),
      language: sourceLanguage === 'auto' ? undefined : sourceLanguage,
      traceId: jobId,
    });

    // Parse words into segments
    const transcriptPath = join(workDir, 'transcript.json');

    // Call faster-whisper directly for full transcript output
    let transcriptOutput: string;
    try {
      transcriptOutput = execFileSync('python3', ['/opt/aidilam-studio/runtime/transcription/transcribe.py', audioPath, 'tiny', sourceLanguage || 'zh'], {
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'pipe'], // capture stderr separately
      });
    } catch (err: any) {
      // execFileSync throws if stderr has content even on success
      // Check if stdout has valid JSON
      if (err.stdout && err.stdout.trim().startsWith('{')) {
        transcriptOutput = err.stdout;
      } else {
        throw new Error(`Whisper failed: ${err.stderr?.slice(0, 200) || err.message}`);
      }
    }
    const transcript = JSON.parse(transcriptOutput);
    writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));

    if (!transcript.segments || transcript.segments.length === 0) {
      throw new Error('Empty transcript — no speech detected');
    }

    await updateJobStage(jobId, 'transcribed');
    logger.info('Transcription complete', { jobId, segments: transcript.segments.length, language: transcript.language });
    await reportProgress(40);

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 5: Real Translation (Google Translate)
    // ═══════════════════════════════════════════════════════════════════════
    await checkCancellation();
    await updateJobStage(jobId, 'translating');
    await reportProgress(45);

    // Resolve translation provider through workspace registry
    const translationResolved = await resolveProvider({ workspaceId, projectId, capability: 'translation' });
    const translationProvider = getTranslationAdapter(translationResolved.providerCode);
    logger.info('Translation provider resolved', { jobId, provider: translationResolved.providerCode, source: translationResolved.resolutionSource });
    const translationInput = transcript.segments.map((s: any, i: number) => ({
      id: `seg-${i}`,
      text: s.text,
      startMs: s.start_ms,
      endMs: s.end_ms,
    }));

    const translationResult = await translationProvider.translateBatch(
      translationInput, sourceLanguage || 'zh', targetLanguage || 'vi'
    );

    if (!translationResult.validation.passed) {
      throw new Error(`Translation validation failed: ${translationResult.validation.errors.join(', ')}`);
    }

    const translationPath = join(workDir, 'translation.json');
    writeFileSync(translationPath, JSON.stringify(translationResult, null, 2));

    await updateJobStage(jobId, 'translated');
    logger.info('Translation complete', { jobId, segments: translationResult.segments.length });
    await reportProgress(55);

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 6: Real TTS (edge-tts)
    // ═══════════════════════════════════════════════════════════════════════
    await checkCancellation();
    await updateJobStage(jobId, 'generating_voice');
    await reportProgress(60);

    // Resolve TTS provider through workspace registry
    const ttsResolved = await resolveProvider({ workspaceId, projectId, capability: 'tts' });
    const ttsProvider = getTtsAdapter(ttsResolved.providerCode);
    logger.info('TTS provider resolved', { jobId, provider: ttsResolved.providerCode, source: ttsResolved.resolutionSource });
    const ttsOutputs: string[] = [];

    for (let i = 0; i < translationResult.segments.length; i++) {
      const seg = translationResult.segments[i];
      const ttsPath = join(workDir, `tts_seg${i}.mp3`);
      await ttsProvider.synthesizeCue(seg.ttsText || seg.subtitleText, voiceCode || 'vi-VN-HoaiMyNeural', ttsPath);
      ttsOutputs.push(ttsPath);
    }

    // Resolve render provider early for concatenation and final render
    const renderResolved = await resolveProvider({ workspaceId, projectId, capability: 'render' });
    const renderAdapter = getRenderAdapter(renderResolved.providerCode);
    logger.info('Render provider resolved', { jobId, provider: renderResolved.providerCode, source: renderResolved.resolutionSource });

    // Concatenate TTS segments via render adapter
    const narrationPath = join(workDir, 'narration.wav');
    renderAdapter.concatenateAudio(ttsOutputs, narrationPath);

    await updateJobStage(jobId, 'voice_generated');
    logger.info('TTS complete', { jobId, segments: ttsOutputs.length });
    await reportProgress(70);

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 7: Subtitle generation + Render
    // ═══════════════════════════════════════════════════════════════════════
    await checkCancellation();
    await updateJobStage(jobId, 'rendering');
    await reportProgress(75);

    // Generate ASS subtitles
    const assPath = join(workDir, 'subtitles.ass');
    let assContent = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,60,60,100,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    for (let i = 0; i < translationResult.segments.length; i++) {
      const seg = translationResult.segments[i];
      const src = transcript.segments[i];
      const startMs = src.start_ms;
      const endMs = src.end_ms;
      const sStr = `${Math.floor(startMs/3600000)}:${String(Math.floor((startMs%3600000)/60000)).padStart(2,'0')}:${String(Math.floor((startMs%60000)/1000)).padStart(2,'0')}.${String(Math.floor((startMs%1000)/10)).padStart(2,'0')}`;
      const eStr = `${Math.floor(endMs/3600000)}:${String(Math.floor((endMs%3600000)/60000)).padStart(2,'0')}:${String(Math.floor((endMs%60000)/1000)).padStart(2,'0')}.${String(Math.floor((endMs%1000)/10)).padStart(2,'0')}`;
      assContent += `Dialogue: 0,${sStr},${eStr},Default,,0,0,0,,${seg.subtitleText}\n`;
    }
    writeFileSync(assPath, assContent);

    // Generate SRT
    const srtPath = join(workDir, 'subtitles.srt');
    let srtContent = '';
    for (let i = 0; i < translationResult.segments.length; i++) {
      const seg = translationResult.segments[i];
      const src = transcript.segments[i];
      const s = src.start_ms;
      const e = src.end_ms;
      srtContent += `${i+1}\n${formatSrtTime(s)} --> ${formatSrtTime(e)}\n${seg.subtitleText}\n\n`;
    }
    writeFileSync(srtPath, srtContent);

    // Render 9:16 video via render adapter
    const outputPath = join(workDir, 'output.mp4');
    const renderDuration = Math.max(duration, 5);
    renderAdapter.renderPortraitVideo({
      sourcePath, narrationPath, assPath, outputPath,
      width, height, duration: renderDuration,
    });

    await updateJobStage(jobId, 'rendered');
    await reportProgress(90);

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 8: QC + Thumbnail
    // ═══════════════════════════════════════════════════════════════════════
    await updateJobStage(jobId, 'quality_check');

    const thumbPath = join(workDir, 'thumbnail.jpg');
    renderAdapter.generateThumbnail(outputPath, thumbPath);

    const outputStat = statSync(outputPath);
    const outputProbe = renderAdapter.probe(outputPath);
    const outputChecksum = createHash('sha256').update(readFileSync(outputPath)).digest('hex');

    // QC checks
    const qcChecks = [
      { check: 'file_exists', pass: outputStat.size > 0 },
      { check: 'resolution', pass: outputProbe.streams?.some((s: any) => s.width === width && s.height === height) },
      { check: 'video_codec', pass: outputProbe.streams?.some((s: any) => s.codec_name === 'h264') },
      { check: 'audio_present', pass: outputProbe.streams?.some((s: any) => s.codec_type === 'audio') },
      { check: 'duration', pass: parseFloat(outputProbe.format?.duration || '0') > 3 },
      { check: 'srt_exists', pass: existsSync(srtPath) },
      { check: 'thumbnail', pass: existsSync(thumbPath) },
    ];
    const qcPassed = qcChecks.every(c => c.pass);

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 9: Persist to MinIO
    // ═══════════════════════════════════════════════════════════════════════
    await reportProgress(95);

    const outputKey = `renders/${projectId}/${jobId}/output.mp4`;
    const srtKey = `renders/${projectId}/${jobId}/subtitles.srt`;
    const thumbKey = `renders/${projectId}/${jobId}/thumbnail.jpg`;
    const transcriptKey = `renders/${projectId}/${jobId}/transcript.json`;
    const translationKey = `renders/${projectId}/${jobId}/translation.json`;

    await minioClient.fPutObject(BUCKET, outputKey, outputPath, { 'Content-Type': 'video/mp4' });
    await minioClient.fPutObject(BUCKET, srtKey, srtPath, { 'Content-Type': 'text/plain; charset=utf-8' });
    await minioClient.fPutObject(BUCKET, thumbKey, thumbPath, { 'Content-Type': 'image/jpeg' });
    await minioClient.fPutObject(BUCKET, transcriptKey, transcriptPath, { 'Content-Type': 'application/json' });
    await minioClient.fPutObject(BUCKET, translationKey, translationPath, { 'Content-Type': 'application/json' });

    // Register output: create new asset OR new version of existing asset
    let outputAssetId: string;
    const isReprocess = !!(input as any).reprocess && (input as any).targetAssetId;

    if (isReprocess) {
      // Create new version of existing logical asset
      const targetAssetId = (input as any).targetAssetId;
      const maxVer = await pool.query(`SELECT max(version_number) as v FROM aidilam_app.asset_versions WHERE asset_id=$1`, [targetAssetId]);
      const nextVer = ((maxVer.rows[0]?.v) || 1) + 1;
      const verRes = await pool.query(
        `INSERT INTO aidilam_app.asset_versions (asset_id, version_number, storage_reference, checksum_sha256, size_bytes, mime_type, created_by_job_id, review_state)
         VALUES ($1, $2, $3, $4, $5, 'video/mp4', $6, 'review_ready')
         ON CONFLICT (asset_id, version_number) DO NOTHING RETURNING id`,
        [targetAssetId, nextVer, outputKey, outputChecksum, outputStat.size, jobId]
      );
      if (verRes.rows.length > 0) {
        await pool.query(`UPDATE aidilam_app.assets SET current_version_id=$1, updated_at=now() WHERE id=$2`, [verRes.rows[0].id, targetAssetId]);
      }
      outputAssetId = targetAssetId;
      logger.info('Asset version created', { jobId, assetId: targetAssetId, version: nextVer });
    } else {
      // Create new logical asset
      const outputAssetRes = await pool.query(
        `INSERT INTO aidilam_app.assets (project_id, bucket_name, object_key, original_filename, content_type, media_kind, status, size_bytes, checksum_sha256)
         VALUES ($1, $2, $3, 'pipeline-output.mp4', 'video/mp4', 'video', 'available', $4, $5)
         RETURNING id`,
        [projectId, BUCKET, outputKey, outputStat.size, outputChecksum]
      );
      outputAssetId = outputAssetRes.rows[0].id;

      // Also create v1 in asset_versions
      const v1Res = await pool.query(
        `INSERT INTO aidilam_app.asset_versions (asset_id, version_number, storage_reference, checksum_sha256, size_bytes, mime_type, created_by_job_id, review_state)
         VALUES ($1, 1, $2, $3, $4, 'video/mp4', $5, 'review_ready')
         ON CONFLICT (asset_id, version_number) DO NOTHING RETURNING id`,
        [outputAssetId, outputKey, outputChecksum, outputStat.size, jobId]
      );
      if (v1Res.rows.length > 0) {
        await pool.query(`UPDATE aidilam_app.assets SET current_version_id=$1 WHERE id=$2`, [v1Res.rows[0].id, outputAssetId]);
      }
    }

    // Write lineage: source → final video
    await pool.query(
      `INSERT INTO aidilam_app.asset_lineage (parent_asset_id, child_asset_id, relationship_type, job_id, stage)
       VALUES ($1, $2, 'render', $3, 'render') ON CONFLICT DO NOTHING`,
      [sourceAssetId, outputAssetId, jobId]
    );

    // ═══════════════════════════════════════════════════════════════════════
    // Stage 10: Mark review-ready
    // ═══════════════════════════════════════════════════════════════════════
    if (qcPassed) {
      await updateJobStage(jobId, 'review_ready');
    } else {
      await updateJobStage(jobId, 'failed');
    }

    await reportProgress(100);

    logger.info('Video pipeline complete', {
      jobId, outputAssetId, duration: parseFloat(outputProbe.format?.duration || '0'),
      size: outputStat.size, qcPassed,
    });

    return {
      outputAssetId,
      outputKey,
      srtKey,
      thumbKey,
      transcriptSegments: transcript.segments.length,
      translationSegments: translationResult.segments.length,
      duration: parseFloat(outputProbe.format?.duration || '0'),
      size: outputStat.size,
      checksum: outputChecksum,
      qcPassed,
      qcChecks,
    };
  } finally {
    // Cleanup temp
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

async function updateJobStage(jobId: string, stage: string): Promise<void> {
  await pool.query(
    `UPDATE aidilam_app.jobs SET status = CASE WHEN $2 IN ('review_ready','failed') THEN
      CASE WHEN $2 = 'review_ready' THEN 'succeeded' ELSE 'failed' END
      ELSE 'running' END,
     result_payload = jsonb_set(COALESCE(result_payload, '{}')::jsonb, '{currentStage}', to_jsonb($2::text)),
     updated_at = now() WHERE id = $1`,
    [jobId, stage]
  );
}

function formatSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(msRem).padStart(3,'0')}`;
}
