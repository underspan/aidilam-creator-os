/**
 * Shadow Workflow Worker Handler
 * AIDILAM-COM-04E3R
 *
 * Executes real shadow workflow through DAG using governed provider adapters.
 * Reads immutable ExecutionSnapshot. Never creates canonical assets/reviews.
 * Uses same providers as legacy pipeline: faster-whisper, Google Translate, Edge TTS, FFmpeg.
 */
import type { JobContext } from './types.js';
import { pool } from '../infrastructure/database.js';
import { minioClient, BUCKET } from '../infrastructure/minio.js';
import { logger } from '../logging/index.js';
import { resolveProvider, getSttAdapter, getTranslationAdapter, getTtsAdapter, getRenderAdapter, getWorkspaceIdForProject } from './provider-resolver.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SHADOW_PREFIX = 'shadow';
const TEMP_BASE = '/tmp/aidilam-shadow';

// Feature guard
const SHADOW_ENABLED = process.env.WORKFLOW_SHADOW_ENABLED !== 'false';

export async function handleShadowWorkflow(context: JobContext): Promise<Record<string, unknown>> {
  const { jobId, inputPayload, reportProgress } = context;
  const { executionId } = inputPayload as { executionId: string };

  if (!SHADOW_ENABLED) throw new Error('SHADOW_DISABLED: workflow shadow execution is not enabled');
  if (!executionId) throw new Error('MISSING_EXECUTION_ID');

  // Load execution
  const execRes = await pool.query(
    `SELECT e.*, s.snapshot_json, s.workspace_id, s.project_id, s.effective_config_json, s.provider_policy_json, s.input_asset_version_id, s.input_asset_checksum, s.workflow_version_id
     FROM aidilam_app.wf_executions e
     JOIN aidilam_app.wf_execution_snapshots s ON s.id = e.snapshot_id
     WHERE e.id = $1`, [executionId]
  );
  if (execRes.rows.length === 0) throw new Error('EXECUTION_NOT_FOUND');
  const exec = execRes.rows[0];

  // Mode guard
  if (exec.execution_mode !== 'shadow') throw new Error('NOT_SHADOW_MODE: execution_mode=' + exec.execution_mode);
  if (['succeeded', 'failed', 'cancelled'].includes(exec.status)) throw new Error('EXECUTION_ALREADY_TERMINAL');

  const snapshot = exec.snapshot_json;
  const frozenNodes: Array<{ nodeKey: string; nodeType: string; ordinal: number }> = snapshot.nodes || [];
  const frozenEdges: Array<{ from: string; to: string }> = snapshot.edges || [];
  const config = exec.effective_config_json || {};
  const workspaceId = exec.workspace_id;
  const projectId = exec.project_id;

  // Transition to running
  await pool.query(`UPDATE aidilam_app.wf_executions SET status='running', started_at=now(), state_version=state_version+1, updated_at=now() WHERE id=$1 AND status='prepared'`, [executionId]);
  await auditEvent(executionId, 'workflow_shadow_started', null, { nodeCount: frozenNodes.length });

  const workDir = join(TEMP_BASE, executionId);
  mkdirSync(workDir, { recursive: true });

  try {
    // Load node execution records
    const nodesRes = await pool.query(`SELECT * FROM aidilam_app.wf_node_executions WHERE execution_id=$1 ORDER BY ordinal`, [executionId]);
    const nodeExecs = nodesRes.rows;
    const nodeMap = new Map(nodeExecs.map(n => [n.node_key, n]));
    const nodeStatuses = new Map(nodeExecs.map(n => [n.node_key, n.status]));
    const nodeOutputs = new Map<string, any>();

    const sortedNodes = [...frozenNodes].sort((a, b) => a.ordinal - b.ordinal);
    let executionFailed = false;
    let nodesSucceeded = 0;

    // DAG-driven execution loop
    for (let iteration = 0; iteration < sortedNodes.length * 4; iteration++) {
      let advanced = false;

      for (const fNode of sortedNodes) {
        const status = nodeStatuses.get(fNode.nodeKey);
        if (!status || ['succeeded', 'failed', 'skipped', 'cancelled'].includes(status)) continue;
        if (executionFailed && status !== 'running') continue;

        const ne = nodeMap.get(fNode.nodeKey);
        if (!ne) continue;

        // Check readiness (DAG-driven)
        if (status === 'pending') {
          const predecessors = frozenEdges.filter(e => e.to === fNode.nodeKey).map(e => e.from);
          const allReady = predecessors.length === 0 || predecessors.every(p => nodeStatuses.get(p) === 'succeeded');
          if (allReady) {
            await pool.query(`UPDATE aidilam_app.wf_node_executions SET status='ready', state_version=state_version+1, updated_at=now() WHERE id=$1`, [ne.id]);
            nodeStatuses.set(fNode.nodeKey, 'ready');
            advanced = true;
          }
          continue;
        }

        if (status === 'ready') {
          // Transition to running
          await pool.query(`UPDATE aidilam_app.wf_node_executions SET status='running', started_at=now(), state_version=state_version+1, updated_at=now() WHERE id=$1`, [ne.id]);
          nodeStatuses.set(fNode.nodeKey, 'running');
          await pool.query(`UPDATE aidilam_app.wf_executions SET current_node_key=$2, state_version=state_version+1, updated_at=now() WHERE id=$1`, [executionId, fNode.nodeKey]);
          await auditEvent(executionId, 'workflow_shadow_node_started', fNode.nodeKey, { attempt: ne.attempt });

          // Execute real handler
          const startTime = Date.now();
          try {
            const output = await executeRealNode(fNode, workDir, config, workspaceId, projectId, executionId, exec.input_asset_version_id, nodeOutputs);
            const duration = Date.now() - startTime;
            nodeOutputs.set(fNode.nodeKey, output);

            // Persist shadow artifact
            if (output.storageBinding) {
              await pool.query(
                `INSERT INTO aidilam_app.wf_shadow_artifacts (workspace_id, project_id, execution_id, node_execution_id, node_key, artifact_type, storage_binding, checksum_sha256, size_bytes, mime_type, metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [workspaceId, projectId, executionId, ne.id, fNode.nodeKey, output.artifactType || 'shadow_evidence', output.storageBinding, output.checksum || null, output.sizeBytes || null, output.mimeType || null, JSON.stringify(output.metadata || {})]
              );
            }

            // Log provider call
            if (output.capability) {
              await pool.query(
                `INSERT INTO aidilam_app.wf_shadow_provider_calls (execution_id, node_key, capability, provider_code, attempt, duration_ms, result, detail_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [executionId, fNode.nodeKey, output.capability, output.providerCode || '', ne.attempt, duration, 'success', JSON.stringify(output.metadata || {})]
              );
            }

            // Node succeeded
            await pool.query(`UPDATE aidilam_app.wf_node_executions SET status='succeeded', completed_at=now(), progress_percent=100, output_reference_json=$2, state_version=state_version+1, updated_at=now() WHERE id=$1`, [ne.id, JSON.stringify(output.metadata || {})]);
            nodeStatuses.set(fNode.nodeKey, 'succeeded');
            nodesSucceeded++;
            await auditEvent(executionId, 'workflow_shadow_node_succeeded', fNode.nodeKey, { duration });

          } catch (err: any) {
            const duration = Date.now() - startTime;
            logger.error('Shadow node failed', { executionId, nodeKey: fNode.nodeKey, error: err.message });
            await pool.query(`UPDATE aidilam_app.wf_node_executions SET status='failed', failed_at=now(), failure_code=$2, state_version=state_version+1, updated_at=now() WHERE id=$1`, [ne.id, err.message?.substring(0, 200) || 'UNKNOWN']);
            nodeStatuses.set(fNode.nodeKey, 'failed');
            executionFailed = true;
            await auditEvent(executionId, 'workflow_shadow_node_failed', fNode.nodeKey, { error: err.message?.substring(0, 200), duration });
          }

          // Update progress
          const succeeded = [...nodeStatuses.values()].filter(s => s === 'succeeded').length;
          const progress = Math.round((succeeded / frozenNodes.length) * 100);
          await pool.query(`UPDATE aidilam_app.wf_executions SET progress_percent=$2, state_version=state_version+1, updated_at=now() WHERE id=$1`, [executionId, progress]);
          await reportProgress(progress);
          advanced = true;
          continue;
        }
      }
      if (!advanced) break;
    }

    // Final status
    if (executionFailed) {
      await pool.query(`UPDATE aidilam_app.wf_executions SET status='failed', failed_at=now(), failure_code='NODE_FAILED', state_version=state_version+1, updated_at=now() WHERE id=$1`, [executionId]);
      await auditEvent(executionId, 'workflow_shadow_failed', null, { nodesSucceeded });
    } else {
      await pool.query(`UPDATE aidilam_app.wf_executions SET status='succeeded', completed_at=now(), progress_percent=100, state_version=state_version+1, updated_at=now() WHERE id=$1`, [executionId]);
      await auditEvent(executionId, 'workflow_shadow_succeeded', null, { nodesSucceeded });
    }

    return { executionId, status: executionFailed ? 'failed' : 'succeeded', nodesSucceeded, totalNodes: frozenNodes.length };

  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// === REAL NODE EXECUTION (delegates to governed adapters) ===
async function executeRealNode(
  node: { nodeKey: string; nodeType: string },
  workDir: string,
  config: Record<string, any>,
  workspaceId: string,
  projectId: string,
  executionId: string,
  inputAssetVersionId: string | null,
  previousOutputs: Map<string, any>
): Promise<any> {
  switch (node.nodeType) {
    case 'source': return executeSource(workDir, workspaceId, projectId, inputAssetVersionId);
    case 'analyze': return executeAnalyze(workDir);
    case 'stt': return executeStt(workDir, workspaceId, config, executionId);
    case 'translate': return executeTranslate(workDir, workspaceId, config, previousOutputs);
    case 'tts': return executeTts(workDir, workspaceId, config, previousOutputs);
    case 'align': return executeAlign(workDir, previousOutputs);
    case 'render': return executeRender(workDir, workspaceId, config, executionId, previousOutputs);
    case 'qc': return executeQc(workDir, executionId);
    case 'persist': return executeShadowPersist(workDir, workspaceId, projectId, executionId);
    case 'review': return executeShadowReview(executionId);
    default: return { metadata: { skipped: true, reason: 'unknown_node_type' } };
  }
}

async function executeSource(workDir: string, workspaceId: string, projectId: string, assetVersionId: string | null): Promise<any> {
  if (!assetVersionId) throw new Error('NO_INPUT_ASSET_VERSION');
  const avRes = await pool.query(`SELECT av.storage_reference, av.checksum_sha256, av.size_bytes FROM aidilam_app.asset_versions av WHERE av.id=$1`, [assetVersionId]);
  if (avRes.rows.length === 0) throw new Error('ASSET_VERSION_NOT_FOUND');
  const av = avRes.rows[0];

  // Download from MinIO
  const sourcePath = join(workDir, 'source.mp4');
  // Get asset to find object_key
  const assetRes = await pool.query(`SELECT a.object_key FROM aidilam_app.assets a JOIN aidilam_app.asset_versions av ON av.asset_id=a.id WHERE av.id=$1`, [assetVersionId]);
  if (assetRes.rows.length === 0) throw new Error('ASSET_NOT_FOUND');
  await minioClient.fGetObject(BUCKET, assetRes.rows[0].object_key, sourcePath);

  return { artifactType: 'source_copy', storageBinding: `${SHADOW_PREFIX}/${workspaceId}/${sourcePath}`, checksum: av.checksum_sha256, sizeBytes: av.size_bytes, mimeType: 'video/mp4', metadata: { assetVersionId, objectKey: 'shadow-local' } };
}

async function executeAnalyze(workDir: string): Promise<any> {
  const sourcePath = join(workDir, 'source.mp4');
  if (!existsSync(sourcePath)) throw new Error('SOURCE_NOT_AVAILABLE');
  // Run ffprobe
  const probe = execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', sourcePath], { encoding: 'utf8' });
  const info = JSON.parse(probe);
  const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
  const duration = parseFloat(info.format?.duration || '0');
  return { metadata: { duration, width: videoStream?.width, height: videoStream?.height, codec: videoStream?.codec_name }, capability: 'metadata_extraction' };
}

async function executeStt(workDir: string, workspaceId: string, config: Record<string, any>, executionId: string): Promise<any> {
  const resolved = await resolveProvider({ workspaceId, capability: 'stt' });
  const adapter = getSttAdapter(resolved.providerCode);
  const sourcePath = join(workDir, 'source.mp4');
  const audioPath = join(workDir, 'audio.wav');
  // Extract audio
  execFileSync('ffmpeg', ['-y', '-i', sourcePath, '-ar', '16000', '-ac', '1', '-f', 'wav', audioPath], { stdio: 'pipe' });
  // Run STT via adapter
  const result = await adapter.transcribeSegment({ segmentId: 'shadow-full', audioPath, startMs: 0, endMs: 999000, language: config.sourceLanguage || 'zh', traceId: `shadow-${executionId || 'unknown'}` });
  const transcript = result.words?.map((w: any) => w.text).join(' ') || '';
  writeFileSync(join(workDir, 'transcript.txt'), transcript);
  return { artifactType: 'transcript', storageBinding: `${SHADOW_PREFIX}/transcript`, checksum: createHash('sha256').update(transcript).digest('hex'), sizeBytes: Buffer.byteLength(transcript), mimeType: 'text/plain', metadata: { language: config.sourceLanguage || 'zh', segmentCount: 1, transcript: transcript.substring(0, 500) }, capability: 'stt', providerCode: resolved.providerCode };
}

async function executeTranslate(workDir: string, workspaceId: string, config: Record<string, any>, prev: Map<string, any>): Promise<any> {
  const resolved = await resolveProvider({ workspaceId, capability: 'translation' });
  const adapter = getTranslationAdapter(resolved.providerCode);
  const transcriptPath = join(workDir, 'transcript.txt');
  const sourceText = existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : (prev.get('stt')?.metadata?.transcript || '');
  if (!sourceText) throw new Error('NO_TRANSCRIPT_FOR_TRANSLATION');
  const result = await adapter.translateBatch([{ id: 'shadow-0', text: sourceText, startMs: 0, endMs: 999000 }], config.sourceLanguage || 'zh', config.targetLanguage || 'vi');
  const translated = result.segments?.[0]?.ttsText || result.segments?.[0]?.subtitleText || '';
  writeFileSync(join(workDir, 'translation.txt'), translated);
  return { artifactType: 'translation', storageBinding: `${SHADOW_PREFIX}/translation`, checksum: createHash('sha256').update(translated).digest('hex'), sizeBytes: Buffer.byteLength(translated), mimeType: 'text/plain', metadata: { targetLanguage: config.targetLanguage || 'vi', translatedText: translated.substring(0, 500) }, capability: 'translation', providerCode: resolved.providerCode };
}

async function executeTts(workDir: string, workspaceId: string, config: Record<string, any>, prev: Map<string, any>): Promise<any> {
  const resolved = await resolveProvider({ workspaceId, capability: 'tts' });
  const adapter = getTtsAdapter(resolved.providerCode);
  const translationPath = join(workDir, 'translation.txt');
  const text = existsSync(translationPath) ? readFileSync(translationPath, 'utf8') : (prev.get('translate')?.metadata?.translatedText || '');
  if (!text) throw new Error('NO_TEXT_FOR_TTS');
  const voice = config.voiceCode || 'vi-VN-HoaiMyNeural';
  const audioPath = join(workDir, 'tts_output.mp3');
  const result = await adapter.synthesizeCue(text, voice, audioPath);
  const stat = statSync(audioPath);
  return { artifactType: 'audio_tts', storageBinding: `${SHADOW_PREFIX}/tts`, checksum: createHash('sha256').update(readFileSync(audioPath)).digest('hex'), sizeBytes: stat.size, mimeType: 'audio/mpeg', metadata: { voice, duration: result.durationEstimateMs ? result.durationEstimateMs / 1000 : 0 }, capability: 'tts', providerCode: resolved.providerCode };
}

async function executeAlign(workDir: string, prev: Map<string, any>): Promise<any> {
  // Alignment: just verify TTS output exists (deterministic step)
  const ttsPath = join(workDir, 'tts_output.mp3');
  if (!existsSync(ttsPath)) throw new Error('TTS_OUTPUT_NOT_AVAILABLE');
  return { metadata: { aligned: true, ttsExists: true } };
}

async function executeRender(workDir: string, workspaceId: string, config: Record<string, any>, executionId: string, prev: Map<string, any>): Promise<any> {
  const resolved = await resolveProvider({ workspaceId, capability: 'render' });
  const adapter = getRenderAdapter(resolved.providerCode);
  const sourcePath = join(workDir, 'source.mp4');
  const ttsPath = join(workDir, 'tts_output.mp3');
  const outputPath = join(workDir, 'shadow_output.mp4');
  const width = config.outputWidth || 1080;
  const height = config.outputHeight || 1920;

  // Get source duration via probe
  const probeInfo = adapter.probe(sourcePath);
  const duration = parseFloat(probeInfo.format?.duration || '10');

  // Create minimal ASS file for shadow render
  const assPath = join(workDir, 'shadow.ass');
  writeFileSync(assPath, `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`);

  // Render using adapter
  adapter.renderPortraitVideo({ sourcePath, narrationPath: ttsPath, assPath, outputPath, width, height, duration });

  const stat = statSync(outputPath);
  const checksum = createHash('sha256').update(readFileSync(outputPath)).digest('hex');

  // Upload to shadow namespace in MinIO
  const shadowKey = `${SHADOW_PREFIX}/${workspaceId}/${executionId}/render/output.mp4`;
  await minioClient.fPutObject(BUCKET, shadowKey, outputPath, { 'Content-Type': 'video/mp4' });

  // Probe output
  const probe = adapter.probe(outputPath);
  const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
  const outDuration = parseFloat(probe.format?.duration || '0');

  return { artifactType: 'rendered_video', storageBinding: shadowKey, checksum, sizeBytes: stat.size, mimeType: 'video/mp4', metadata: { width: videoStream?.width, height: videoStream?.height, duration: outDuration, codec: videoStream?.codec_name, resolution: `${videoStream?.width}x${videoStream?.height}` }, capability: 'render', providerCode: resolved.providerCode };
}

async function executeQc(workDir: string, executionId: string): Promise<any> {
  const outputPath = join(workDir, 'shadow_output.mp4');
  if (!existsSync(outputPath)) throw new Error('RENDER_OUTPUT_NOT_AVAILABLE');
  const stat = statSync(outputPath);
  // Basic QC: file exists, size > 0, probe succeeds
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', outputPath], { encoding: 'utf8' }));
  const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
  const audioStream = probe.streams?.find((s: any) => s.codec_type === 'audio');
  const duration = parseFloat(probe.format?.duration || '0');
  const qcPass = stat.size > 0 && !!videoStream && duration > 0;
  return { artifactType: 'qc_report', storageBinding: `${SHADOW_PREFIX}/qc`, metadata: { qcResult: qcPass ? 'PASS' : 'FAIL', size: stat.size, hasVideo: !!videoStream, hasAudio: !!audioStream, duration } };
}

async function executeShadowPersist(workDir: string, workspaceId: string, projectId: string, executionId: string): Promise<any> {
  // Shadow persist: record evidence only. Do NOT create canonical Asset/AssetVersion.
  return { artifactType: 'shadow_evidence', storageBinding: `${SHADOW_PREFIX}/${workspaceId}/${executionId}/persist/evidence`, metadata: { shadowOnly: true, canonicalAssetCreated: false, canonicalVersionCreated: false } };
}

async function executeShadowReview(executionId: string): Promise<any> {
  // Shadow review: Do NOT create canonical Review. Mark comparison_ready.
  return { metadata: { shadowOnly: true, canonicalReviewCreated: false, comparisonReady: true } };
}

async function auditEvent(executionId: string, eventType: string, nodeKey: string | null, detail: any): Promise<void> {
  await pool.query(
    `INSERT INTO aidilam_app.wf_execution_audit (execution_id, event_type, node_key, detail_json) VALUES ($1,$2,$3,$4)`,
    [executionId, eventType, nodeKey, JSON.stringify(detail)]
  );
}
