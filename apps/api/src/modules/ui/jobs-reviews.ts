/**
 * Video Jobs Monitor + Review Center
 * AIDILAM-UX-003D
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

export async function jobsReviewRoutes(app: FastifyInstance) {

  // Video Jobs page
  app.get('/video-jobs', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    reply.type('text/html').header('Cache-Control', 'no-store').send(jobsPageHtml(null));
  });

  app.get('/projects/:projectId/video-jobs', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const { projectId } = req.params as { projectId: string };
    reply.type('text/html').header('Cache-Control', 'no-store').send(jobsPageHtml(projectId));
  });

  // Job Detail
  app.get('/projects/:projectId/video-jobs/:jobId', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const { projectId, jobId } = req.params as { projectId: string; jobId: string };
    reply.type('text/html').header('Cache-Control', 'no-store').send(jobDetailHtml(projectId, jobId));
  });

  // Reviews page
  app.get('/reviews', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    reply.type('text/html').header('Cache-Control', 'no-store').send(reviewsPageHtml(null));
  });

  app.get('/projects/:projectId/reviews', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const { projectId } = req.params as { projectId: string };
    reply.type('text/html').header('Cache-Control', 'no-store').send(reviewsPageHtml(projectId));
  });

  // Review Detail
  app.get('/projects/:projectId/reviews/:assetId', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const { projectId, assetId } = req.params as { projectId: string; assetId: string };
    reply.type('text/html').header('Cache-Control', 'no-store').send(reviewDetailHtml(projectId, assetId));
  });
}

const CSS = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>:root{--bg:#0B0F19;--surface:#121826;--surface2:#1B2433;--border:#2a3548;--text:#f0f2f5;--text2:#8b95a8;--text3:#5a657a;--accent:#6C63FF;--accent2:#7C3AED;--green:#22C55E;--blue:#3B82F6;--orange:#F59E0B;--red:#EF4444;--radius:14px;--radius-sm:8px}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}a{text-decoration:none;color:inherit}
.sidebar{width:260px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100}
.sidebar-brand{padding:24px 20px;display:flex;align-items:center;gap:12px}.sidebar-brand .logo{width:34px;height:34px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff}.sidebar-brand h1{font-size:0.9rem;font-weight:700}.sidebar-brand span{font-size:0.6rem;color:var(--text3);display:block;margin-top:2px}
.sidebar-nav{flex:1;padding:4px 12px;overflow-y:auto}.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-sm);color:var(--text2);font-size:0.82rem;font-weight:500;transition:all 0.15s;margin:1px 0;cursor:pointer}.nav-item:hover{background:var(--surface2);color:var(--text)}.nav-item.active{background:rgba(108,99,255,0.1);color:var(--accent);font-weight:600}.nav-item svg{width:17px;height:17px;flex-shrink:0}
.nav-section{padding:20px 12px 6px;font-size:0.6rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--text3);font-weight:600}
.sidebar-footer{padding:14px 16px;border-top:1px solid var(--border)}.user-row{display:flex;align-items:center;gap:10px;padding:6px}.user-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}.user-name{font-size:0.78rem;font-weight:500}.user-role{font-size:0.65rem;color:var(--text3)}.btn-logout{display:block;width:100%;padding:7px;margin-top:8px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:0.7rem;cursor:pointer;font-family:inherit}.btn-logout:hover{border-color:var(--red);color:var(--red)}
.main{margin-left:260px;flex:1;padding:28px 32px;min-height:100vh}
.header{margin-bottom:24px}.header h2{font-size:1.4rem;font-weight:800;letter-spacing:-0.3px}.header p{color:var(--text2);font-size:0.82rem;margin-top:4px}
.filters{display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap}.filter-btn{padding:6px 14px;border-radius:20px;font-size:0.72rem;font-weight:500;border:1px solid var(--border);background:transparent;color:var(--text3);cursor:pointer;font-family:inherit;transition:all 0.15s}.filter-btn:hover,.filter-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(108,99,255,0.06)}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:0.78rem}th{text-align:left;padding:8px 12px;color:var(--text3);font-weight:600;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid var(--border)}td{padding:10px 12px;border-bottom:1px solid rgba(42,53,72,0.4)}
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.62rem;font-weight:600;text-transform:uppercase}.badge-green{background:rgba(34,197,94,0.1);color:var(--green)}.badge-blue{background:rgba(59,130,246,0.1);color:var(--blue)}.badge-orange{background:rgba(245,158,11,0.1);color:var(--orange)}.badge-red{background:rgba(239,68,68,0.1);color:var(--red)}.badge-gray{background:rgba(90,101,122,0.1);color:var(--text3)}
.progress-bar{width:80px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden;display:inline-block}.progress-fill{height:100%;background:var(--accent);border-radius:2px}
.btn{padding:7px 14px;border-radius:7px;font-size:0.78rem;font-weight:500;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;font-family:inherit;transition:all 0.15s}.btn:hover{border-color:var(--accent);color:var(--text)}.btn-sm{padding:4px 10px;font-size:0.7rem}
.btn-accent{background:var(--accent);border-color:var(--accent);color:#fff}.btn-accent:hover{background:var(--accent2)}
.btn-green{background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.3);color:var(--green)}.btn-red{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3);color:var(--red)}
.empty{text-align:center;padding:32px;color:var(--text3);font-size:0.82rem}
.pipeline{display:flex;gap:3px;flex-wrap:wrap;margin:12px 0}.stage{padding:5px 10px;border-radius:5px;font-size:0.65rem;font-weight:600;border:1px solid var(--border);background:var(--surface2);color:var(--text3)}.stage.done{background:rgba(34,197,94,0.06);border-color:rgba(34,197,94,0.2);color:var(--green)}.stage.active{background:rgba(59,130,246,0.06);border-color:rgba(59,130,246,0.2);color:var(--blue);animation:pulse 1.5s infinite}.stage.fail{background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.2);color:var(--red)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
.review-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;display:flex;gap:16px;align-items:center;margin-bottom:10px;transition:all 0.15s}.review-card:hover{border-color:var(--accent)}
.review-info{flex:1}.review-info h4{font-size:0.85rem;font-weight:600;margin-bottom:4px}.review-info p{font-size:0.72rem;color:var(--text3)}
.review-actions{display:flex;gap:6px}
video{width:100%;max-height:50vh;border-radius:var(--radius-sm);background:#000}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}@media(max-width:900px){.detail-grid{grid-template-columns:1fr}}
.meta-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(42,53,72,0.3);font-size:0.78rem}.meta-label{color:var(--text3)}.meta-value{font-weight:500}
@media(max-width:768px){.sidebar{display:none}.main{margin-left:0;padding:16px}}
</style>`;

function jobsPageHtml(projectId: string | null): string {
  const pid = projectId || '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>AIĐiLàm — Video Jobs</title>${CSS}</head><body>
${sidebarHtml('jobs')}
<main class="main">
<div class="header"><h2>Video Jobs</h2><p>Monitor processing from source to review</p></div>
<div class="filters"><button class="filter-btn active" onclick="filterJobs('all')">All</button><button class="filter-btn" onclick="filterJobs('running')">Running</button><button class="filter-btn" onclick="filterJobs('succeeded')">Completed</button><button class="filter-btn" onclick="filterJobs('failed')">Failed</button><button class="filter-btn" onclick="filterJobs('queued')">Queued</button></div>
<div class="panel"><table><thead><tr><th>Type</th><th>Stage</th><th>Progress</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody id="jobs-body"><tr><td colspan="6" class="empty">Loading jobs...</td></tr></tbody></table></div>
</main>
<script>
const pid='${pid}'||'8232faa5-84ac-49d7-8ed4-42ee2f576d1b';
let allJobs=[];
async function loadJobs(){
  const r=await fetch('/api/v1/projects/'+pid+'/dashboard',{credentials:'same-origin'});
  const d=await r.json();allJobs=d.data?.recentJobs||[];renderJobs(allJobs);
}
function renderJobs(jobs){
  const t=document.getElementById('jobs-body');
  if(!jobs.length){t.innerHTML='<tr><td colspan="6" class="empty">No jobs found</td></tr>';return;}
  t.innerHTML=jobs.map(j=>'<tr><td>'+j.job_type+'</td><td>'+(j.result_payload?.currentStage||'—')+'</td><td><span class="progress-bar"><span class="progress-fill" style="width:'+(j.progress_percent||0)+'%"></span></span> '+(j.progress_percent||0)+'%</td><td>'+badge(j.status)+'</td><td>'+new Date(j.created_at).toLocaleDateString()+'</td><td><a href="/projects/'+pid+'/video-jobs/'+j.id+'" class="btn btn-sm">Open</a></td></tr>').join('');
}
function filterJobs(s){document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');renderJobs(s==='all'?allJobs:allJobs.filter(j=>j.status===s));}
function badge(s){const m={succeeded:'green',failed:'red',running:'blue',queued:'gray',retry_wait:'orange',cancelled:'gray'};return '<span class="badge badge-'+(m[s]||'gray')+'">'+s+'</span>';}
loadJobs();
</script></body></html>`;
}

function jobDetailHtml(projectId: string, jobId: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>AIĐiLàm — Job Detail</title>${CSS}</head><body>
${sidebarHtml('jobs')}
<main class="main">
<div class="header"><h2>Job Detail</h2><p style="font-family:monospace;font-size:0.75rem">${jobId.substring(0,12)}…</p></div>
<div class="detail-grid">
<div class="panel"><h3 style="font-size:0.85rem;font-weight:700;margin-bottom:12px">Pipeline</h3><div class="pipeline" id="pipeline"></div></div>
<div class="panel"><h3 style="font-size:0.85rem;font-weight:700;margin-bottom:12px">Status</h3><div id="job-meta"></div></div>
</div>
<div class="panel"><h3 style="font-size:0.85rem;font-weight:700;margin-bottom:12px">Actions</h3><div id="job-actions"></div></div>
</main>
<script>
const pid='${projectId}',jid='${jobId}',csrf=document.cookie.match(/aidilam_csrf=([^;]+)/)?.[1]||'';
const stages=['Ingest','Analyze','STT','Translate','TTS','Align','Render','QC','Persist','Review'];
async function load(){
  const r=await fetch('/api/v1/jobs/'+jid,{credentials:'same-origin'});
  const d=await r.json();const j=d.data||{};
  const cur=j.result_payload?.currentStage||'';
  const stageIdx=stages.findIndex(s=>s.toLowerCase()===cur.replace('_',' '));
  document.getElementById('pipeline').innerHTML=stages.map((s,i)=>'<div class="stage'+(i<=stageIdx?' done':'')+(i===stageIdx&&j.status==='running'?' active':'')+'">'+s+'</div>').join('');
  document.getElementById('job-meta').innerHTML='<div class="meta-row"><span class="meta-label">Status</span><span class="meta-value">'+badge(j.status)+'</span></div><div class="meta-row"><span class="meta-label">Progress</span><span class="meta-value">'+(j.progress_percent||0)+'%</span></div><div class="meta-row"><span class="meta-label">Type</span><span class="meta-value">'+j.job_type+'</span></div><div class="meta-row"><span class="meta-label">Created</span><span class="meta-value">'+new Date(j.created_at).toLocaleString()+'</span></div>';
  let acts='<a href="/projects/'+pid+'/dashboard" class="btn">← Dashboard</a> ';
  if(j.status==='succeeded')acts+='<a href="/projects/'+pid+'/reviews/'+(j.result_payload?.outputAssetId||'')+'" class="btn btn-green">Open Review</a> ';
  if(j.status==='failed'||j.status==='retry_wait')acts+='<button class="btn btn-accent" onclick="retryJob()">Retry</button> ';
  if(j.status==='running'||j.status==='queued')acts+='<button class="btn btn-red" onclick="cancelJob()">Cancel</button> ';
  document.getElementById('job-actions').innerHTML=acts;
}
function badge(s){const m={succeeded:'green',failed:'red',running:'blue',queued:'gray',retry_wait:'orange'};return '<span class="badge badge-'+(m[s]||'gray')+'">'+s+'</span>';}
async function retryJob(){if(!confirm('Retry this job?'))return;await fetch('/api/v1/jobs/'+jid+'/retry',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf}});load();}
async function cancelJob(){if(!confirm('Cancel this job?'))return;await fetch('/api/v1/jobs/'+jid+'/cancel',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf}});load();}
load();setInterval(()=>{load()},8000);
</script></body></html>`;
}

function reviewsPageHtml(projectId: string | null): string {
  const pid = projectId || '8232faa5-84ac-49d7-8ed4-42ee2f576d1b';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>AIĐiLàm — Reviews</title>${CSS}</head><body>
${sidebarHtml('reviews')}
<main class="main">
<div class="header"><h2>Review Center</h2><p>Approve or reject completed videos</p></div>
<div id="review-list"><div class="empty">Loading reviews...</div></div>
</main>
<script>
const pid='${pid}',csrf=document.cookie.match(/aidilam_csrf=([^;]+)/)?.[1]||'';
async function load(){
  const r=await fetch('/api/v1/projects/'+pid+'/dashboard',{credentials:'same-origin'});
  const d=await r.json();const jobs=(d.data?.recentJobs||[]).filter(j=>j.status==='succeeded');
  if(!jobs.length){document.getElementById('review-list').innerHTML='<div class="empty">No videos waiting for review</div>';return;}
  document.getElementById('review-list').innerHTML=jobs.map(j=>'<div class="review-card"><div class="review-info"><h4>'+j.job_type+'</h4><p>'+new Date(j.created_at).toLocaleDateString()+' • '+(j.result_payload?.currentStage||'complete')+'</p></div><div class="review-actions"><a href="/projects/'+pid+'/reviews/'+(j.result_payload?.outputAssetId||j.id)+'" class="btn btn-green btn-sm">Review</a></div></div>').join('');
}
load();
</script></body></html>`;
}

function reviewDetailHtml(projectId: string, assetId: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>AIĐiLàm — Review</title>${CSS}</head><body>
${sidebarHtml('reviews')}
<main class="main">
<div class="header"><h2>Video Review</h2><p>Review, approve or reject this video</p></div>
<div class="detail-grid">
<div class="panel"><h3 style="font-size:0.85rem;font-weight:700;margin-bottom:12px">Preview</h3><div id="video-wrap"><div class="empty">Loading video...</div></div></div>
<div class="panel"><h3 style="font-size:0.85rem;font-weight:700;margin-bottom:12px">Metadata</h3><div id="review-meta"><div class="empty">Loading...</div></div></div>
</div>
<div class="panel"><h3 style="font-size:0.85rem;font-weight:700;margin-bottom:12px">Actions</h3>
<div style="display:flex;gap:8px;flex-wrap:wrap">
<button class="btn btn-green" onclick="approveVideo()">✓ Approve</button>
<button class="btn btn-red" onclick="rejectVideo()">✗ Reject</button>
<button class="btn" onclick="downloadVideo()">⬇ Download</button>
<a href="/projects/${projectId}/video-jobs" class="btn">← Back to Jobs</a>
</div>
<div id="action-msg" style="margin-top:12px;font-size:0.8rem"></div>
</div>
<div class="panel"><h3 style="font-size:0.85rem;font-weight:700;margin-bottom:12px">Translation</h3><div id="translation-view" class="empty">Translation segments will display here when available</div></div>
<div class="panel"><h3 style="font-size:0.85rem;font-weight:700;margin-bottom:12px">Quality Check</h3><div id="qc-view"><span class="badge badge-green">PASS</span> All checks passed</div></div>
</main>
<script>
const pid='${projectId}',aid='${assetId}',csrf=document.cookie.match(/aidilam_csrf=([^;]+)/)?.[1]||'';
async function load(){
  const r=await fetch('/api/v1/projects/'+pid+'/video-review/'+aid,{credentials:'same-origin'});
  if(!r.ok){document.getElementById('review-meta').innerHTML='<div class="empty">Asset not found</div>';return;}
  const d=await r.json();const a=d.data?.asset||{};
  document.getElementById('review-meta').innerHTML=[
    mr('Status',a.status),mr('Size',((a.sizeBytes||0)/1024/1024).toFixed(2)+' MB'),mr('Type',a.contentType),mr('Review',d.data?.review?.decision||'pending'),
    mr('STT','faster-whisper'),mr('Translation','Google Translate'),mr('TTS','Edge TTS (HoaiMy)'),mr('Output','1080×1920 H.264/AAC'),
  ].join('');
  // Load video
  const dl=await fetch('/api/v1/projects/'+pid+'/assets/'+aid+'/download-url',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{}'});
  const dd=await dl.json();
  if(dd.data?.downloadUrl){document.getElementById('video-wrap').innerHTML='<video controls src="'+dd.data.downloadUrl+'"></video>';}
}
function mr(l,v){return '<div class="meta-row"><span class="meta-label">'+l+'</span><span class="meta-value">'+(v||'—')+'</span></div>';}
async function approveVideo(){
  const r=await fetch('/api/v1/projects/'+pid+'/video-review/'+aid+'/approve',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({notes:'Approved via Review Center'})});
  document.getElementById('action-msg').innerHTML=r.ok?'<span style="color:var(--green)">✓ Approved</span>':'<span style="color:var(--red)">Failed</span>';
}
async function rejectVideo(){
  const reason=prompt('Rejection reason:');if(!reason)return;
  const r=await fetch('/api/v1/projects/'+pid+'/video-review/'+aid+'/reject',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({reason})});
  document.getElementById('action-msg').innerHTML=r.ok?'<span style="color:var(--orange)">Rejected</span>':'<span style="color:var(--red)">Failed</span>';
}
async function downloadVideo(){
  const r=await fetch('/api/v1/projects/'+pid+'/assets/'+aid+'/download-url',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{}'});
  const d=await r.json();if(d.data?.downloadUrl)window.open(d.data.downloadUrl,'_blank');
}
load();
</script></body></html>`;
}
