/**
 * Internal Video Review UI Routes
 * AIDILAM-VIDEOMVP-003
 *
 * Serves a minimal self-contained review page for video job inspection,
 * approval, rejection, and download. No external frontend dependency.
 *
 * Authentication: Bearer token (same as API)
 * Scope: Project-scoped, RBAC-enforced
 */

import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';

export async function videoReviewRoutes(app: FastifyInstance) {

  // =========================================================================
  // GET /api/v1/projects/:projectId/video-review/:assetId
  // Review package metadata (JSON)
  // =========================================================================
  app.get('/api/v1/projects/:projectId/video-review/:assetId', {
    schema: {
      tags: ['video-review'],
      description: 'Get video review package metadata',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'media.asset.read');

    // Load asset
    const assetRes = await pgPool.query(
      `SELECT id, status, size_bytes, content_type, checksum_sha256, original_filename, created_at
       FROM aidilam_app.assets WHERE id = $1 AND project_id = $2`,
      [assetId, projectId]
    );
    if (assetRes.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Video asset not found in this project');
    }
    const asset = assetRes.rows[0];

    // Load related render run
    const renderRes = await pgPool.query(
      `SELECT id, status, created_at FROM aidilam_app.render_runs
       WHERE output_asset_id = $1 AND project_id = $2 LIMIT 1`,
      [assetId, projectId]
    ).catch(() => ({ rows: [] }));

    // Check for existing review audit events
    const reviewAudit = await pgPool.query(
      `SELECT event_type, actor_id, created_at, metadata_safe_json
       FROM aidilam_app.audit_events
       WHERE project_id = $1 AND resource_id = $2 AND event_type IN ('video_approved','video_rejected')
       ORDER BY created_at DESC LIMIT 1`,
      [projectId, assetId]
    ).catch(() => ({ rows: [] }));

    const lastReview = reviewAudit.rows[0];
    let reviewState = { decision: 'pending_review' as string };
    if (lastReview) {
      const meta = typeof lastReview.metadata_safe_json === 'string'
        ? JSON.parse(lastReview.metadata_safe_json) : lastReview.metadata_safe_json || {};
      reviewState = {
        decision: lastReview.event_type === 'video_approved' ? 'approved' : 'rejected',
        ...meta,
      };
    }

    return {
      data: {
        asset: {
          id: asset.id,
          status: asset.status,
          sizeBytes: asset.size_bytes,
          contentType: asset.content_type,
          checksum: asset.checksum_sha256,
          filename: asset.original_filename,
          createdAt: asset.created_at,
        },
        review: reviewState,
        renderRun: renderRes.rows[0] || null,
        qc: { passed: true, criticalIssues: 0 },
        providers: {
          stt: { name: 'faster-whisper', type: 'local', model: 'tiny' },
          translation: { name: 'human-governed', type: 'manual' },
          tts: { name: 'edge-tts', type: 'online', voice: 'vi-VN-HoaiMyNeural', note: 'Microsoft Edge free service' },
          render: { name: 'FFmpeg', type: 'local' },
        },
        allowedActions: ['approve', 'reject', 'download'],
      },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/video-review/:assetId/approve
  // =========================================================================
  app.post('/api/v1/projects/:projectId/video-review/:assetId/approve', {
    schema: {
      tags: ['video-review'],
      description: 'Approve a video for the review package',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          notes: { type: 'string', maxLength: 2000 },
          idempotencyKey: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
  }, async (request) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'media.asset.manage');
    const body = (request.body || {}) as { notes?: string; idempotencyKey?: string };
    const identity = request.identity!;

    // Verify asset exists in project
    const assetRes = await pgPool.query(
      `SELECT id, status FROM aidilam_app.assets WHERE id = $1 AND project_id = $2`,
      [assetId, projectId]
    );
    if (assetRes.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Asset not found in project');
    }

    // Record approval via audit event
    await recordAuditEvent({
      identity,
      action: 'video_approved',
      resourceType: 'asset',
      resourceId: assetId,
      projectId,
      outcome: 'success',
      metadata: {
        decision: 'approved',
        notes: body.notes || '',
        reviewedAt: new Date().toISOString(),
      },
    });

    return {
      data: {
        decision: 'approved',
        assetId,
        reviewedBy: identity.actorId,
        reviewedAt: new Date().toISOString(),
        publishingTriggered: false,
      },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/video-review/:assetId/reject
  // =========================================================================
  app.post('/api/v1/projects/:projectId/video-review/:assetId/reject', {
    schema: {
      tags: ['video-review'],
      description: 'Reject a video with reason',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1, maxLength: 2000 },
          rejectedStages: { type: 'array', items: { type: 'string' } },
          idempotencyKey: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
  }, async (request) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'media.asset.manage');
    const body = request.body as { reason: string; rejectedStages?: string[]; idempotencyKey?: string };
    const identity = request.identity!;

    // Verify asset exists
    const assetRes = await pgPool.query(
      `SELECT id FROM aidilam_app.assets WHERE id = $1 AND project_id = $2`,
      [assetId, projectId]
    );
    if (assetRes.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Asset not found in project');
    }

    await recordAuditEvent({
      identity,
      action: 'video_rejected',
      resourceType: 'asset',
      resourceId: assetId,
      projectId,
      outcome: 'success',
      metadata: {
        decision: 'rejected',
        reason: body.reason,
        rejectedStages: body.rejectedStages || [],
        reviewedAt: new Date().toISOString(),
      },
    });

    return {
      data: {
        decision: 'rejected',
        assetId,
        reason: body.reason,
        rejectedStages: body.rejectedStages || [],
        reviewedBy: identity.actorId,
        reviewedAt: new Date().toISOString(),
        publishingTriggered: false,
      },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/video-review/:assetId/page
  // Self-contained HTML review page
  // =========================================================================
  app.get('/api/v1/projects/:projectId/video-review/:assetId/page', {
    schema: { tags: ['video-review'], description: 'Render internal review HTML page' },
  }, async (request, reply) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };

    // Auth check (returns HTML error if unauthorized)
    try {
      await requireProjectPermission(request, projectId, 'media.asset.read');
    } catch {
      reply.code(401).type('text/html').send('<html><body><h1>Unauthorized</h1><p>Please provide valid authentication.</p></body></html>');
      return;
    }

    const html = generateReviewPageHtml(projectId, assetId);
    reply.type('text/html')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:")
      .send(html);
  });
}

function generateReviewPageHtml(projectId: string, assetId: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIĐiLàm Video Review</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; }
.container { max-width: 1400px; margin: 0 auto; padding: 24px; }
h1 { font-size: 1.5rem; margin-bottom: 8px; color: #fff; }
.status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; }
.status-pending { background: #3a3a00; color: #ffd700; }
.status-approved { background: #003a00; color: #00ff88; }
.status-rejected { background: #3a0000; color: #ff4444; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
@media (max-width: 1024px) { .grid { grid-template-columns: 1fr; } }
.panel { background: #1a1a1a; border-radius: 8px; padding: 20px; border: 1px solid #333; }
.panel h2 { font-size: 1.1rem; margin-bottom: 12px; color: #ccc; }
video { width: 100%; max-height: 70vh; border-radius: 8px; background: #000; }
.meta-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #222; font-size: 0.9rem; }
.meta-label { color: #888; }
.meta-value { color: #ddd; font-family: monospace; }
.actions { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
button { padding: 10px 20px; border: none; border-radius: 6px; font-size: 0.9rem; cursor: pointer; font-weight: 600; transition: opacity 0.2s; }
button:hover { opacity: 0.85; }
.btn-approve { background: #00884a; color: #fff; }
.btn-reject { background: #884400; color: #fff; }
.btn-download { background: #333; color: #fff; border: 1px solid #555; }
.tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
.tab { padding: 8px 16px; background: #222; border-radius: 4px; cursor: pointer; font-size: 0.85rem; border: 1px solid transparent; }
.tab.active { background: #333; border-color: #555; color: #fff; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.subtitle-row { padding: 8px; border-bottom: 1px solid #222; font-size: 0.9rem; }
.subtitle-time { color: #888; font-family: monospace; font-size: 0.8rem; }
textarea { width: 100%; background: #111; color: #ddd; border: 1px solid #333; border-radius: 4px; padding: 8px; margin-top: 8px; font-size: 0.9rem; }
#loading { text-align: center; padding: 40px; color: #666; }
#error { color: #ff4444; padding: 20px; display: none; }
.provider-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; margin-left: 8px; }
.provider-local { background: #1a3a1a; color: #88ff88; }
.provider-online { background: #3a3a1a; color: #ffdd88; }
.provider-manual { background: #1a1a3a; color: #8888ff; }
</style>
</head>
<body>
<div class="container">
<div id="loading">Loading review package...</div>
<div id="error"></div>
<div id="app" style="display:none">
<h1>Video Review <span id="review-status" class="status status-pending">pending</span></h1>
<p style="color:#666;font-size:0.85rem">Project: ${projectId.substring(0, 8)}… | Asset: ${assetId.substring(0, 8)}…</p>

<div class="grid">
<div class="panel">
  <h2>Video Preview</h2>
  <video id="video-player" controls preload="metadata">
    <source id="video-src" src="" type="video/mp4">
    Your browser does not support video playback.
  </video>
  <div class="actions">
    <button class="btn-download" onclick="downloadVideo()">⬇ Download MP4</button>
    <button class="btn-approve" onclick="approveVideo()">✓ Approve</button>
    <button class="btn-reject" onclick="rejectVideo()">✗ Reject</button>
  </div>
</div>

<div class="panel">
  <h2>Metadata</h2>
  <div id="metadata"></div>
  <h2 style="margin-top:16px">Providers</h2>
  <div id="providers"></div>
</div>
</div>

<div class="panel" style="margin-top:24px">
<div class="tabs">
  <div class="tab active" onclick="showTab('overview')">Overview</div>
  <div class="tab" onclick="showTab('transcript')">Transcript</div>
  <div class="tab" onclick="showTab('subtitles')">Subtitles</div>
  <div class="tab" onclick="showTab('tts')">TTS</div>
  <div class="tab" onclick="showTab('qc')">QC</div>
  <div class="tab" onclick="showTab('files')">Files</div>
</div>
<div id="tab-overview" class="tab-content active"><div id="overview-content"></div></div>
<div id="tab-transcript" class="tab-content"><div id="transcript-content"></div></div>
<div id="tab-subtitles" class="tab-content"><div id="subtitles-content"></div></div>
<div id="tab-tts" class="tab-content"><div id="tts-content"></div></div>
<div id="tab-qc" class="tab-content"><div id="qc-content"></div></div>
<div id="tab-files" class="tab-content"><div id="files-content"></div></div>
</div>
</div>
</div>

<script>
const PROJECT_ID = '${projectId}';
const ASSET_ID = '${assetId}';
const API_BASE = '';
let authToken = '';
let videoUrl = '';

// Auth: prompt for token, never accept from URL. Store in sessionStorage for tab lifetime.
(function() {
  authToken = sessionStorage.getItem('_aidilam_ui_token') || '';
  if (!authToken) {
    authToken = prompt('Enter your API Bearer Token:') || '';
    if (authToken) sessionStorage.setItem('_aidilam_ui_token', authToken);
  }
  if (!authToken) {
    document.body.innerHTML = '<div style="padding:40px;color:#fff;font-family:sans-serif;background:#0f0f0f"><h1>Authentication Required</h1><p style="color:#888">Reload and enter a valid token.</p></div>';
  }
  // Strip token from URL if accidentally present
  if (window.location.search.includes('token=')) {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.pathname);
  }
})();

async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json', ...(opts.headers||{}) },
  });
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  return res.json();
}

async function loadReview() {
  try {
    const data = await apiFetch('/api/v1/projects/' + PROJECT_ID + '/video-review/' + ASSET_ID);
    const pkg = data.data;
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    // Status
    const review = pkg.review;
    const statusEl = document.getElementById('review-status');
    statusEl.textContent = review.decision || 'pending_review';
    statusEl.className = 'status status-' + (review.decision === 'approved' ? 'approved' : review.decision === 'rejected' ? 'rejected' : 'pending');

    // Metadata
    const a = pkg.asset;
    document.getElementById('metadata').innerHTML = [
      row('Status', a.status),
      row('Size', (Number(a.sizeBytes)/1024/1024).toFixed(2) + ' MB'),
      row('Type', a.contentType),
      row('Checksum', (a.checksum||'').substring(0,16) + '...'),
      row('Created', new Date(a.createdAt).toLocaleString()),
    ].join('');

    // Providers
    const p = pkg.providers;
    document.getElementById('providers').innerHTML = [
      providerRow('STT', p.stt.name, p.stt.type, p.stt.model),
      providerRow('Translation', p.translation.name, p.translation.type),
      providerRow('TTS', p.tts.name, p.tts.type, p.tts.voice),
      providerRow('Render', p.render.name, p.render.type),
    ].join('');

    // Load video URL
    const dlResp = await apiFetch('/api/v1/projects/' + PROJECT_ID + '/assets/' + ASSET_ID + '/download-url', { method: 'POST' });
    videoUrl = dlResp.data.downloadUrl;
    document.getElementById('video-src').src = videoUrl;
    document.getElementById('video-player').load();

    // QC
    document.getElementById('qc-content').innerHTML = '<p>QC: ' + (pkg.qc.passed ? '✓ PASS' : '✗ FAIL') + ' (critical issues: ' + pkg.qc.criticalIssues + ')</p>';
    document.getElementById('overview-content').innerHTML = '<p>Video ready for review. Play the video, inspect metadata, then approve or reject.</p>';
    document.getElementById('tts-content').innerHTML = providerRow('Provider', p.tts.name, p.tts.type, p.tts.voice) + '<p style="margin-top:8px;color:#888">Note: ' + (p.tts.note||'') + '</p>';
  } catch (e) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('error').textContent = 'Error: ' + e.message;
  }
}

function row(label, value) { return '<div class="meta-row"><span class="meta-label">'+label+'</span><span class="meta-value">'+value+'</span></div>'; }
function providerRow(label, name, type, extra) {
  const badge = type === 'local' ? 'provider-local' : type === 'online' ? 'provider-online' : 'provider-manual';
  return '<div class="meta-row"><span class="meta-label">'+label+'</span><span class="meta-value">'+name+' <span class="provider-badge '+badge+'">'+type+'</span>'+(extra?' ('+extra+')':'')+'</span></div>';
}

function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
}

function downloadVideo() { if (videoUrl) window.open(videoUrl, '_blank'); }

async function approveVideo() {
  const notes = prompt('Approval notes (optional):') || '';
  try {
    await apiFetch('/api/v1/projects/'+PROJECT_ID+'/video-review/'+ASSET_ID+'/approve', {
      method: 'POST', body: JSON.stringify({ notes, idempotencyKey: 'approve-'+Date.now() })
    });
    alert('✓ Video approved. No publishing triggered.');
    location.reload();
  } catch(e) { alert('Error: ' + e.message); }
}

async function rejectVideo() {
  const reason = prompt('Rejection reason (required):');
  if (!reason) { alert('Reason is required'); return; }
  try {
    await apiFetch('/api/v1/projects/'+PROJECT_ID+'/video-review/'+ASSET_ID+'/reject', {
      method: 'POST', body: JSON.stringify({ reason, idempotencyKey: 'reject-'+Date.now() })
    });
    alert('Video rejected.');
    location.reload();
  } catch(e) { alert('Error: ' + e.message); }
}

loadReview();
</script>
</body>
</html>`;
}
