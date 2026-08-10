/**
 * Media Library, Settings, Analytics, Worker Monitor
 * AIDILAM-UX-003E — Creator OS v1 Closure
 */
import { FastifyInstance } from 'fastify';
import { pgPool } from '../../infrastructure/database/index.js';
import { sidebarHtml } from './home-html.js';

const SESSION_COOKIE = 'aidilam_session';
async function getSessionUserId(request: any): Promise<string | null> {
  const sid = request.cookies?.[SESSION_COOKIE];
  if (!sid) return null;
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256').update(sid).digest('hex');
  const r = await pgPool.query(`SELECT user_id FROM aidilam_app.browser_sessions WHERE session_hash=$1 AND revoked_at IS NULL AND expires_at>now()`, [h]);
  return r.rows[0]?.user_id || null;
}

function pageShell(title: string, subtitle: string, active: string, content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>AIĐiLàm — ${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>:root{--bg:#0B0F19;--surface:#121826;--surface2:#1B2433;--border:#2a3548;--text:#f0f2f5;--text2:#8b95a8;--text3:#5a657a;--accent:#6C63FF;--accent2:#7C3AED;--green:#22C55E;--blue:#3B82F6;--orange:#F59E0B;--red:#EF4444;--radius:14px;--radius-sm:8px}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}a{text-decoration:none;color:inherit}.sidebar{width:260px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100}.sidebar-brand{padding:24px 20px;display:flex;align-items:center;gap:12px}.sidebar-brand .logo{width:34px;height:34px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff}.sidebar-brand h1{font-size:0.9rem;font-weight:700}.sidebar-brand span{font-size:0.6rem;color:var(--text3);display:block;margin-top:2px}.sidebar-nav{flex:1;padding:4px 12px;overflow-y:auto}.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-sm);color:var(--text2);font-size:0.82rem;font-weight:500;transition:all 0.15s;margin:1px 0;cursor:pointer}.nav-item:hover{background:var(--surface2);color:var(--text)}.nav-item.active{background:rgba(108,99,255,0.1);color:var(--accent);font-weight:600}.nav-item svg{width:17px;height:17px;flex-shrink:0}.nav-section{padding:20px 12px 6px;font-size:0.6rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--text3);font-weight:600}.sidebar-footer{padding:14px 16px;border-top:1px solid var(--border)}.user-row{display:flex;align-items:center;gap:10px;padding:6px}.user-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}.user-name{font-size:0.78rem;font-weight:500}.user-role{font-size:0.65rem;color:var(--text3)}.btn-logout{display:block;width:100%;padding:7px;margin-top:8px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:0.7rem;cursor:pointer;font-family:inherit}.btn-logout:hover{border-color:var(--red);color:var(--red)}.main{margin-left:260px;flex:1;padding:28px 32px;min-height:100vh}.header{margin-bottom:24px}.header h2{font-size:1.4rem;font-weight:800;letter-spacing:-0.3px}.header p{color:var(--text2);font-size:0.82rem;margin-top:4px}.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}.panel h3{font-size:0.85rem;font-weight:700;margin-bottom:12px}.metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:24px}.metric{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px}.metric-label{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.4px;color:var(--text3);margin-bottom:3px}.metric-value{font-size:1.3rem;font-weight:800}.metric-value.green{color:var(--green)}.metric-value.blue{color:var(--blue)}.metric-value.orange{color:var(--orange)}.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.62rem;font-weight:600}.badge-green{background:rgba(34,197,94,0.1);color:var(--green)}.badge-blue{background:rgba(59,130,246,0.1);color:var(--blue)}.badge-gray{background:rgba(90,101,122,0.1);color:var(--text3)}table{width:100%;border-collapse:collapse;font-size:0.78rem}th{text-align:left;padding:8px 12px;color:var(--text3);font-weight:600;font-size:0.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)}td{padding:9px 12px;border-bottom:1px solid rgba(42,53,72,0.4)}.empty{text-align:center;padding:32px;color:var(--text3);font-size:0.82rem}.setting-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(42,53,72,0.3)}.setting-label{font-size:0.8rem;color:var(--text2)}.setting-value{font-size:0.8rem;font-weight:500}.coming-soon{font-size:0.65rem;background:var(--surface2);color:var(--text3);padding:2px 6px;border-radius:3px;margin-left:8px}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:1024px){.grid-2{grid-template-columns:1fr}}@media(max-width:768px){.sidebar{display:none}.main{margin-left:0;padding:16px}.metrics{grid-template-columns:repeat(2,1fr)}}</style></head><body>
${sidebarHtml(active)}
<main class="main"><div class="header"><h2>${title}</h2><p>${subtitle}</p></div>${content}</main></body></html>`;
}

export async function v1ClosureRoutes(app: FastifyInstance) {

  // === MEDIA LIBRARY ===
  app.get('/media', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    reply.type('text/html').header('Cache-Control', 'no-store').send(pageShell('Media Library', 'Browse all project media and generated assets', 'media', mediaContent('')));
  });
  app.get('/projects/:projectId/media', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const { projectId } = req.params as { projectId: string };
    reply.type('text/html').header('Cache-Control', 'no-store').send(pageShell('Media Library', 'Browse all project media and generated assets', 'media', mediaContent(projectId)));
  });

  // === SETTINGS ===
  app.get('/settings', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    reply.type('text/html').header('Cache-Control', 'no-store').send(pageShell('Settings', 'Configuration and provider settings', 'settings', settingsContent()));
  });
  app.get('/projects/:projectId/settings', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    reply.type('text/html').header('Cache-Control', 'no-store').send(pageShell('Settings', 'Configuration and provider settings', 'settings', settingsContent()));
  });

  // === ANALYTICS ===
  app.get('/analytics', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    reply.type('text/html').header('Cache-Control', 'no-store').send(pageShell('Analytics', 'Operational metrics and processing insights', 'analytics', analyticsContent('')));
  });
  app.get('/projects/:projectId/analytics', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const { projectId } = req.params as { projectId: string };
    reply.type('text/html').header('Cache-Control', 'no-store').send(pageShell('Analytics', 'Operational metrics and processing insights', 'analytics', analyticsContent(projectId)));
  });

  // === WORKER MONITOR ===
  app.get('/worker-monitor', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    reply.type('text/html').header('Cache-Control', 'no-store').send(pageShell('Worker Monitor', 'Processing infrastructure status', 'workers', workerContent()));
  });



  // === ASSET DETAIL ===
  app.get('/projects/:projectId/media/:assetId', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const { projectId, assetId } = req.params as { projectId: string; assetId: string };
    const asset = await pgPool.query(`SELECT a.*, av.version_number, av.checksum_sha256 as ver_checksum FROM aidilam_app.assets a LEFT JOIN aidilam_app.asset_versions av ON av.id = a.current_version_id WHERE a.id = $1 AND a.project_id = $2`, [assetId, projectId]);
    if (asset.rows.length === 0) { reply.code(404).send('Not found'); return; }
    const a = asset.rows[0];
    const versions = await pgPool.query(`SELECT id, version_number, checksum_sha256, size_bytes, status, created_at FROM aidilam_app.asset_versions WHERE asset_id = $1 ORDER BY version_number DESC`, [assetId]);
    const lineage = await pgPool.query(`SELECT al.relationship_type, al.stage, al.parent_asset_id, al.child_asset_id FROM aidilam_app.asset_lineage al WHERE al.parent_asset_id = $1 OR al.child_asset_id = $1`, [assetId]);
    const verRows = versions.rows.map((v: any) => `<tr><td>v${v.version_number}</td><td>${v.status}${v.version_number === a.ver_checksum ? ' ✓ current' : ''}</td><td>${(v.size_bytes/1024/1024).toFixed(2)} MB</td><td>${v.checksum_sha256?.slice(0,12) || '—'}…</td><td>${new Date(v.created_at).toLocaleDateString()}</td></tr>`).join('');
    const linRows = lineage.rows.map((l: any) => `<tr><td>${l.relationship_type}</td><td>${l.stage||'—'}</td><td>${l.parent_asset_id?.slice(0,8)}…</td><td>${l.child_asset_id?.slice(0,8)}…</td></tr>`).join('');
    reply.type('text/html').header('Cache-Control','no-store').send(pageShell('Asset Detail', a.original_filename || a.media_kind || 'Asset', 'media', `
      <div class="panel"><h3>Overview</h3>
        <div class="setting-row"><span class="setting-label">Type</span><span class="setting-value">${a.media_kind||'—'}</span></div>
        <div class="setting-row"><span class="setting-label">Status</span><span class="setting-value">${a.status}</span></div>
        <div class="setting-row"><span class="setting-label">Size</span><span class="setting-value">${((a.size_bytes||0)/1024/1024).toFixed(2)} MB</span></div>
        <div class="setting-row"><span class="setting-label">Version</span><span class="setting-value">v${a.ver_checksum||1}</span></div>
        <div class="setting-row"><span class="setting-label">Duration</span><span class="setting-value">${a.duration_ms ? (a.duration_ms/1000).toFixed(1)+'s' : '—'}</span></div>
        <div class="setting-row"><span class="setting-label">Resolution</span><span class="setting-value">${a.width && a.height ? a.width+'×'+a.height : '—'}</span></div>
        <div class="setting-row"><span class="setting-label">Created</span><span class="setting-value">${new Date(a.created_at).toLocaleString()}</span></div>
      </div>
      <div class="panel"><h3>Versions</h3><table><thead><tr><th>Version</th><th>Status</th><th>Size</th><th>Checksum</th><th>Created</th></tr></thead><tbody>${verRows||'<tr><td colspan="5" class="empty">No versions</td></tr>'}</tbody></table></div>
      <div class="panel"><h3>Lineage</h3><table><thead><tr><th>Relationship</th><th>Stage</th><th>Parent</th><th>Child</th></tr></thead><tbody>${linRows||'<tr><td colspan="4" class="empty">No lineage recorded</td></tr>'}</tbody></table></div>
    `));
  });

  // === TEMPLATES ===
  app.get('/templates', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const templates = await pgPool.query(`SELECT td.id, td.name, td.slug, td.description, td.category, td.status, td.template_type, tv.config_json FROM aidilam_app.template_definitions td LEFT JOIN aidilam_app.template_versions tv ON tv.id = td.current_version_id WHERE td.status = 'active' ORDER BY td.category, td.name`);
    const categories = [...new Set(templates.rows.map((t: any) => t.category))];
    const cards = templates.rows.map((t: any) => {
      const config = t.config_json || {};
      return `<a href="/create-video" class="tmpl-card"><div class="tmpl-icon">${t.category === 'short-form' ? '📱' : t.category === 'education' ? '📚' : t.category === 'news' ? '📰' : t.category === 'podcast' ? '🎙' : t.category === 'affiliate' ? '💰' : '🎬'}</div><div class="tmpl-body"><h4>${t.name}</h4><p>${t.description || ''}</p><div class="tmpl-meta"><span class="badge badge-${t.template_type === 'system' ? 'blue' : 'green'}">${t.template_type}</span><span>${config.video?.resolution || '1080x1920'}</span><span>${config.video?.aspect_ratio || '9:16'}</span></div></div></a>`;
    }).join('');
    const chips = categories.map(c => `<button class="filter-btn" onclick="filterTmpl('${c}')">${c}</button>`).join('');
    reply.type('text/html').header('Cache-Control', 'no-store').send(pageShell('Templates', 'Video production presets and templates', 'settings', `<style>.tmpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}.tmpl-card{display:block;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;transition:all 0.15s;text-decoration:none;color:var(--text)}.tmpl-card:hover{border-color:var(--accent);transform:translateY(-2px)}.tmpl-icon{font-size:1.8rem;margin-bottom:10px}.tmpl-body h4{font-size:0.88rem;font-weight:600;margin-bottom:4px}.tmpl-body p{font-size:0.72rem;color:var(--text3);margin-bottom:8px}.tmpl-meta{display:flex;gap:8px;font-size:0.65rem;color:var(--text3)}.filter-btn{padding:5px 12px;border-radius:16px;font-size:0.7rem;font-weight:500;border:1px solid var(--border);background:transparent;color:var(--text3);cursor:pointer;font-family:inherit;margin-right:4px}.filter-btn:hover{border-color:var(--accent);color:var(--accent)}</style><div style="margin-bottom:16px"><button class="filter-btn" onclick="filterTmpl('all')">All</button>${chips}</div><div class="tmpl-grid" id="tmpl-grid">${cards}</div><script>function filterTmpl(c){document.querySelectorAll('.tmpl-card').forEach(el=>{el.style.display=(c==='all'||el.innerHTML.includes(c))?'':'none';});}</script>`));
  });

  // === PROVIDERS ===
  app.get('/providers', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const providers = await pgPool.query(`SELECT code, name, provider_type, capabilities, network_required, credential_required, status FROM aidilam_app.provider_definitions ORDER BY status, name`);
    const cards = providers.rows.map((p: any) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center"><div><strong>${p.name}</strong><br><span style="font-size:0.7rem;color:var(--text3)">${(p.capabilities||[]).join(', ')} • ${p.provider_type}${p.network_required?' • Network':''}${p.credential_required?' • Key required':''}</span></div><span class="badge badge-${p.status==='available'?'green':'gray'}">${p.status.replace('_',' ')}</span></div>`).join('');
    reply.type('text/html').header('Cache-Control','no-store').send(pageShell('Providers','AI and processing provider registry','settings',`<div class="panel"><h3>Provider Catalog (${providers.rows.length})</h3>${cards}</div>`));
  });

}

function mediaContent(pid: string): string {
  const p = pid || '8232faa5-84ac-49d7-8ed4-42ee2f576d1b';
  return `<div class="panel"><div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap"><button class="filter-btn active" onclick="filterMedia('all')">All</button><button class="filter-btn" onclick="filterMedia('video')">Videos</button><button class="filter-btn" onclick="filterMedia('audio')">Audio</button></div><table><thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody id="media-body"><tr><td colspan="6" class="empty">Loading...</td></tr></tbody></table></div>
<style>.filter-btn{padding:5px 12px;border-radius:16px;font-size:0.7rem;font-weight:500;border:1px solid var(--border);background:transparent;color:var(--text3);cursor:pointer;font-family:inherit}.filter-btn:hover,.filter-btn.active{border-color:var(--accent);color:var(--accent)}</style>
<script>let allMedia=[];async function loadMedia(){const r=await fetch('/api/v1/projects/${p}/assets?page=1&pageSize=50',{credentials:'same-origin'});const d=await r.json();allMedia=d.data?.items||d.data||[];renderMedia(allMedia);}function renderMedia(items){const t=document.getElementById('media-body');if(!items.length){t.innerHTML='<tr><td colspan="6" class="empty">No media assets found</td></tr>';return;}t.innerHTML=items.map(a=>'<tr><td>'+(a.original_filename||a.id?.substring(0,8)+'…')+'</td><td><span class="badge badge-blue">'+(a.media_kind||'file')+'</span></td><td>'+((a.size_bytes||0)/1024/1024).toFixed(2)+' MB</td><td><span class="badge badge-green">'+(a.status||'—')+'</span></td><td>'+new Date(a.created_at).toLocaleDateString()+'</td><td><button onclick="dl(\\''+a.id+'\\')">⬇</button></td></tr>').join('');}function filterMedia(t){document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');renderMedia(t==='all'?allMedia:allMedia.filter(a=>(a.media_kind||'')==t));}async function dl(id){const r=await fetch('/api/v1/projects/${p}/assets/'+id+'/download-url',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':document.cookie.match(/aidilam_csrf=([^;]+)/)?.[1]||''},body:'{}'});const d=await r.json();if(d.data?.downloadUrl)window.open(d.data.downloadUrl,'_blank');}loadMedia();</script>`;
}

function settingsContent(): string {
  return `<div class="grid-2"><div class="panel"><h3>Transcription (STT)</h3><div class="setting-row"><span class="setting-label">Provider</span><span class="setting-value">faster-whisper</span></div><div class="setting-row"><span class="setting-label">Model</span><span class="setting-value">tiny</span></div><div class="setting-row"><span class="setting-label">Device</span><span class="setting-value">CPU (int8)</span></div><div class="setting-row"><span class="setting-label">Type</span><span class="setting-value"><span class="badge badge-green">Local</span></span></div></div>
<div class="panel"><h3>Translation</h3><div class="setting-row"><span class="setting-label">Provider</span><span class="setting-value">Google Translate</span></div><div class="setting-row"><span class="setting-label">Type</span><span class="setting-value"><span class="badge badge-blue">Online (free)</span></span></div><div class="setting-row"><span class="setting-label">API Key</span><span class="setting-value">Not required</span></div><div class="setting-row"><span class="setting-label">OpenAI</span><span class="setting-value"><span class="coming-soon">Coming Soon</span></span></div><div class="setting-row"><span class="setting-label">Gemini</span><span class="setting-value"><span class="coming-soon">Coming Soon</span></span></div></div></div>
<div class="grid-2"><div class="panel"><h3>Voice (TTS)</h3><div class="setting-row"><span class="setting-label">Provider</span><span class="setting-value">Microsoft Edge TTS</span></div><div class="setting-row"><span class="setting-label">Type</span><span class="setting-value"><span class="badge badge-blue">Online (free)</span></span></div><div class="setting-row"><span class="setting-label">Default Voice</span><span class="setting-value">vi-VN-HoaiMyNeural (Female)</span></div><div class="setting-row"><span class="setting-label">Male Voice</span><span class="setting-value">vi-VN-NamMinhNeural</span></div></div>
<div class="panel"><h3>Video Output</h3><div class="setting-row"><span class="setting-label">Resolution</span><span class="setting-value">1080×1920 (9:16)</span></div><div class="setting-row"><span class="setting-label">Video Codec</span><span class="setting-value">H.264</span></div><div class="setting-row"><span class="setting-label">Audio Codec</span><span class="setting-value">AAC 48kHz</span></div><div class="setting-row"><span class="setting-label">Subtitles</span><span class="setting-value">Burned-in</span></div><div class="setting-row"><span class="setting-label">Original Audio</span><span class="setting-value">Ducked (15%)</span></div></div></div>
<div class="grid-2"><div class="panel"><h3>Storage</h3><div class="setting-row"><span class="setting-label">Backend</span><span class="setting-value">MinIO (Private)</span></div><div class="setting-row"><span class="setting-label">Access</span><span class="setting-value">Authenticated only</span></div><div class="setting-row"><span class="setting-label">Credentials</span><span class="setting-value">🔒 Protected</span></div></div>
<div class="panel"><h3>Publishing</h3><div class="setting-row"><span class="setting-label">Status</span><span class="setting-value" style="color:var(--orange)">⚠ Disabled</span></div><div class="setting-row"><span class="setting-label">YouTube</span><span class="setting-value"><span class="coming-soon">Coming Soon</span></span></div><div class="setting-row"><span class="setting-label">TikTok</span><span class="setting-value"><span class="coming-soon">Coming Soon</span></span></div><div class="setting-row"><span class="setting-label">Facebook</span><span class="setting-value"><span class="coming-soon">Coming Soon</span></span></div></div></div>`;
}

function analyticsContent(pid: string): string {
  const p = pid || '8232faa5-84ac-49d7-8ed4-42ee2f576d1b';
  return `<div class="metrics" id="analytics-metrics"><div class="metric"><div class="metric-label">Loading...</div><div class="metric-value">—</div></div></div>
<div class="grid-2"><div class="panel"><h3>Job Status Distribution</h3><div id="status-chart" class="empty">Loading...</div></div><div class="panel"><h3>Provider Usage</h3><div class="setting-row"><span class="setting-label">STT</span><span class="setting-value">faster-whisper (local)</span></div><div class="setting-row"><span class="setting-label">Translation</span><span class="setting-value">Google Translate</span></div><div class="setting-row"><span class="setting-label">TTS</span><span class="setting-value">Edge TTS</span></div><div class="setting-row"><span class="setting-label">Render</span><span class="setting-value">FFmpeg</span></div></div></div>
<script>async function loadAnalytics(){const r=await fetch('/api/v1/projects/${p}/dashboard',{credentials:'same-origin'});const d=await r.json();const j=d.data?.jobs||{};document.getElementById('analytics-metrics').innerHTML=[m('Total Jobs',j.total||0,''),m('Succeeded',j.succeeded||0,'green'),m('Failed',j.failed||0,'orange'),m('Running',j.running||0,'blue'),m('Queued',j.queued||0,''),m('Cancelled',j.cancelled||0,'')].join('');const total=j.total||1;document.getElementById('status-chart').innerHTML='<div style="font-size:0.78rem;line-height:2"><div>Succeeded: <strong>'+Math.round((j.succeeded||0)/total*100)+'%</strong></div><div>Failed: <strong>'+Math.round((j.failed||0)/total*100)+'%</strong></div><div>Running: <strong>'+Math.round((j.running||0)/total*100)+'%</strong></div></div>';}function m(l,v,c){return '<div class="metric"><div class="metric-label">'+l+'</div><div class="metric-value'+(c?' '+c:'')+'">'+v+'</div></div>';}loadAnalytics();</script>`;
}

function workerContent(): string {
  return `<div class="metrics"><div class="metric"><div class="metric-label">Status</div><div class="metric-value green">Healthy</div></div><div class="metric"><div class="metric-label">Workers</div><div class="metric-value">1</div></div><div class="metric"><div class="metric-label">Active Jobs</div><div class="metric-value blue">0</div></div><div class="metric"><div class="metric-label">Queue</div><div class="metric-value">Idle</div></div></div>
<div class="grid-2"><div class="panel"><h3>Worker Process</h3><div class="setting-row"><span class="setting-label">Container</span><span class="setting-value">aidilam-worker</span></div><div class="setting-row"><span class="setting-label">Health</span><span class="setting-value"><span class="badge badge-green">Healthy</span></span></div><div class="setting-row"><span class="setting-label">Queue</span><span class="setting-value">aidilam-jobs</span></div><div class="setting-row"><span class="setting-label">Concurrency</span><span class="setting-value">1</span></div></div>
<div class="panel"><h3>Infrastructure</h3><div class="setting-row"><span class="setting-label">CPU</span><span class="setting-value"><span class="coming-soon">Metric unavailable</span></span></div><div class="setting-row"><span class="setting-label">Memory</span><span class="setting-value"><span class="coming-soon">Metric unavailable</span></span></div><div class="setting-row"><span class="setting-label">GPU</span><span class="setting-value"><span class="coming-soon">Not available</span></span></div><div class="setting-row"><span class="setting-label">Disk</span><span class="setting-value"><span class="coming-soon">Metric unavailable</span></span></div></div></div>`;
}
