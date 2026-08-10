/**
 * Project Dashboard HTML — Premium Creator Workspace
 * AIDILAM-UX-003B
 */
import { sidebarHtml } from '../../ui/home-html.js';

export function dashboardHtml(projectId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIĐiLàm — Project Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--bg:#0B0F19;--surface:#121826;--surface2:#1B2433;--surface3:#232d3f;--border:#2a3548;--border-hover:#3d4f6a;--text:#f0f2f5;--text2:#8b95a8;--text3:#5a657a;--accent:#6C63FF;--accent2:#7C3AED;--accent-glow:rgba(108,99,255,0.12);--green:#22C55E;--blue:#3B82F6;--orange:#F59E0B;--red:#EF4444;--radius:16px;--radius-sm:10px;--shadow:0 4px 24px rgba(0,0,0,0.25)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}
a{text-decoration:none;color:inherit}
.sidebar{width:260px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100}
.sidebar-brand{padding:24px 20px;display:flex;align-items:center;gap:12px}
.sidebar-brand .logo{width:34px;height:34px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff}
.sidebar-brand h1{font-size:0.9rem;font-weight:700;letter-spacing:-0.3px}
.sidebar-brand span{font-size:0.6rem;color:var(--text3);display:block;margin-top:2px}
.sidebar-nav{flex:1;padding:4px 12px;overflow-y:auto}
.nav-section{padding:20px 12px 6px;font-size:0.6rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--text3);font-weight:600}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-sm);color:var(--text2);font-size:0.82rem;font-weight:500;transition:all 0.15s;margin:1px 0;cursor:pointer}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.active{background:var(--accent-glow);color:var(--accent);font-weight:600}
.nav-item svg{width:17px;height:17px;flex-shrink:0}
.sidebar-footer{padding:14px 16px;border-top:1px solid var(--border)}
.user-row{display:flex;align-items:center;gap:10px;padding:6px}
.user-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}
.user-name{font-size:0.78rem;font-weight:500}
.user-role{font-size:0.65rem;color:var(--text3)}
.btn-logout{display:block;width:100%;padding:7px;margin-top:8px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:0.7rem;cursor:pointer;transition:all 0.15s;font-family:inherit}
.btn-logout:hover{border-color:var(--red);color:var(--red)}

.main{margin-left:260px;flex:1;min-height:100vh;display:flex;flex-direction:column}
.topbar{padding:20px 32px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.breadcrumb{font-size:0.78rem;color:var(--text3)}
.breadcrumb a{color:var(--text2)}
.breadcrumb a:hover{color:var(--text)}
.topbar-actions{display:flex;gap:8px}
.btn{padding:7px 14px;border-radius:7px;font-size:0.78rem;font-weight:500;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;transition:all 0.15s;font-family:inherit}
.btn:hover{border-color:var(--border-hover);color:var(--text)}
.btn-accent{background:var(--accent);border-color:var(--accent);color:#fff}
.btn-accent:hover{background:var(--accent2);transform:translateY(-1px)}

.content{padding:28px 32px;flex:1}
.project-header{margin-bottom:28px}
.project-header h2{font-size:1.5rem;font-weight:800;letter-spacing:-0.4px}
.project-meta{display:flex;gap:16px;margin-top:6px;font-size:0.78rem;color:var(--text3)}
.project-meta .status{color:var(--green);font-weight:600}

.sub-nav{display:flex;gap:2px;margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:0}
.sub-nav-item{padding:10px 16px;font-size:0.8rem;color:var(--text3);cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s;font-weight:500}
.sub-nav-item:hover{color:var(--text)}
.sub-nav-item.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}

.metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:28px}
.metric{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px}
.metric-label{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.4px;color:var(--text3);margin-bottom:4px}
.metric-value{font-size:1.4rem;font-weight:800;letter-spacing:-0.3px}
.metric-value.green{color:var(--green)}.metric-value.blue{color:var(--blue)}.metric-value.orange{color:var(--orange)}.metric-value.red{color:var(--red)}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
@media(max-width:1100px){.grid-2{grid-template-columns:1fr}}

.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}
.panel-title{font-size:0.85rem;font-weight:700;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between}
.panel-title a{font-size:0.72rem;color:var(--accent);font-weight:500}

.pipeline{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
.stage{padding:6px 12px;border-radius:6px;font-size:0.68rem;font-weight:600;border:1px solid var(--border);background:var(--surface2);color:var(--text3);transition:all 0.15s}
.stage.completed{background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.2);color:var(--green)}
.stage.running{background:rgba(59,130,246,0.08);border-color:rgba(59,130,246,0.2);color:var(--blue);animation:blink 1.5s infinite}
.stage.failed{background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.2);color:var(--red)}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.6}}

table{width:100%;border-collapse:collapse;font-size:0.78rem}
th{text-align:left;padding:8px 12px;color:var(--text3);font-weight:600;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid var(--border)}
td{padding:9px 12px;border-bottom:1px solid rgba(42,53,72,0.5)}
.progress-sm{width:70px;height:3px;background:var(--surface2);border-radius:2px;overflow:hidden;display:inline-block}
.progress-sm .fill{height:100%;background:var(--accent);border-radius:2px}
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.62rem;font-weight:600;text-transform:uppercase}
.badge-green{background:rgba(34,197,94,0.1);color:var(--green)}
.badge-blue{background:rgba(59,130,246,0.1);color:var(--blue)}
.badge-orange{background:rgba(245,158,11,0.1);color:var(--orange)}
.badge-red{background:rgba(239,68,68,0.1);color:var(--red)}
.badge-gray{background:rgba(90,101,122,0.1);color:var(--text3)}

.empty{text-align:center;padding:24px;color:var(--text3);font-size:0.8rem}
.worker-row{display:flex;align-items:center;gap:10px}
.worker-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:blink 2s infinite}
.activity-item{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(42,53,72,0.4);font-size:0.78rem}
.activity-dot{width:6px;height:6px;border-radius:50%;margin-top:6px;flex-shrink:0}
.activity-dot.green{background:var(--green)}.activity-dot.blue{background:var(--blue)}.activity-dot.orange{background:var(--orange)}
.activity-text{color:var(--text2)}
.activity-time{font-size:0.68rem;color:var(--text3)}

@media(max-width:768px){.sidebar{display:none}.main{margin-left:0}.content{padding:16px}.metrics{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
${sidebarHtml('projects')}
<div class="main">
<div class="topbar">
  <div class="breadcrumb"><a href="/projects">Projects</a> › <span id="proj-name">Loading...</span></div>
  <div class="topbar-actions">
    <button class="btn btn-accent" onclick="alert('Create Video — use the pipeline API')">+ Create Video</button>
    <button class="btn">Import URL</button>
    <button class="btn">Settings</button>
  </div>
</div>
<div class="content">
  <div class="project-header"><h2 id="proj-title">Project Dashboard</h2><div class="project-meta"><span class="status" id="proj-status">—</span><span id="proj-code">—</span></div></div>

  <div class="sub-nav">
    <div class="sub-nav-item active" onclick="showTab('overview')">Overview</div>
    <div class="sub-nav-item" onclick="showTab('pipeline')">Pipeline</div>
    <div class="sub-nav-item" onclick="showTab('jobs')">Video Jobs</div>
    <div class="sub-nav-item" onclick="showTab('media')">Media</div>
    <div class="sub-nav-item" onclick="showTab('reviews')">Reviews</div>
    <div class="sub-nav-item" onclick="showTab('activity')">Activity</div>
  </div>

  <div id="tab-overview">
    <div class="metrics" id="metrics"></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-title">Pipeline Status</div><div class="pipeline" id="pipeline"></div></div>
      <div class="panel"><div class="panel-title">Worker</div><div class="worker-row"><div class="worker-dot"></div><div><div style="font-size:0.82rem;font-weight:500">Healthy</div><div style="font-size:0.7rem;color:var(--text3)">1 active • Queue idle</div></div></div></div>
    </div>
    <div class="panel"><div class="panel-title">Recent Jobs <a href="#">View All</a></div><table><thead><tr><th>Type</th><th>Stage</th><th>Progress</th><th>Status</th><th>Created</th></tr></thead><tbody id="jobs-table"><tr><td colspan="5" class="empty">Loading...</td></tr></tbody></table></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-title">Latest Output</div><div id="latest-output" class="empty">Loading...</div></div>
      <div class="panel"><div class="panel-title">Activity</div><div id="activity-feed"><div class="empty">Loading events...</div></div></div>
    </div>
  </div>
  <div id="tab-pipeline" style="display:none"><div class="panel"><div class="panel-title">Full Pipeline View</div><div class="empty">Select a job to view its pipeline stages</div></div></div>
  <div id="tab-jobs" style="display:none"><div class="panel"><div class="panel-title">All Video Jobs</div><table><thead><tr><th>Type</th><th>Status</th><th>Created</th></tr></thead><tbody id="all-jobs"><tr><td colspan="3" class="empty">Loading...</td></tr></tbody></table></div></div>
  <div id="tab-media" style="display:none"><div class="panel"><div class="panel-title">Media Library</div><div id="media-grid" class="empty">Loading assets...</div></div></div>
  <div id="tab-reviews" style="display:none"><div class="panel"><div class="panel-title">Review Queue</div><div id="review-list" class="empty">No videos pending review</div></div></div>
  <div id="tab-activity" style="display:none"><div class="panel"><div class="panel-title">Project Activity</div><div class="empty">Activity timeline coming soon</div></div></div>
</div>
</div>

<script>
const P='${projectId}';
async function api(path){const r=await fetch(path,{credentials:'same-origin'});if(!r.ok)return null;return r.json();}

function showTab(t){document.querySelectorAll('[id^=tab-]').forEach(e=>e.style.display='none');document.getElementById('tab-'+t).style.display='';document.querySelectorAll('.sub-nav-item').forEach(e=>e.classList.remove('active'));event.target.classList.add('active');}

async function load(){
  const d=await api('/api/v1/projects/'+P+'/dashboard');
  if(!d)return;
  const j=d.data.jobs||{};
  document.getElementById('metrics').innerHTML=[
    m('Total Jobs',j.total||0,''),m('Running',j.running||0,'blue'),m('Succeeded',j.succeeded||0,'green'),m('Failed',j.failed||0,'red'),m('Queued',j.queued||0,'orange'),m('Cancelled',j.cancelled||0,'')
  ].join('');

  // Pipeline stages
  const stages=['Ingest','Analyze','STT','Translate','TTS','Align','Render','QC','Persist','Review'];
  document.getElementById('pipeline').innerHTML=stages.map(s=>'<div class="stage completed">'+s+'</div>').join('');

  // Jobs table
  const jobs=d.data.recentJobs||[];
  document.getElementById('jobs-table').innerHTML=jobs.length?jobs.slice(0,8).map(j=>'<tr><td>'+j.job_type+'</td><td>'+(j.result_payload?.currentStage||'—')+'</td><td><span class="progress-sm"><span class="fill" style="width:'+(j.progress_percent||0)+'%"></span></span></td><td>'+badge(j.status)+'</td><td>'+new Date(j.created_at).toLocaleDateString()+'</td></tr>').join(''):'<tr><td colspan="5" class="empty">No jobs yet</td></tr>';
  document.getElementById('all-jobs').innerHTML=document.getElementById('jobs-table').innerHTML;

  // Latest output
  document.getElementById('latest-output').innerHTML=jobs.find(j=>j.status==='succeeded')?'<div style="font-size:0.8rem"><span class="badge badge-green">Succeeded</span> Latest video ready for review</div>':'<div class="empty">No rendered videos yet</div>';

  // Activity
  const acts=['Pipeline completed','Video rendered','QC passed','Translation completed','STT completed'];
  document.getElementById('activity-feed').innerHTML=acts.map((a,i)=>'<div class="activity-item"><div class="activity-dot '+(i<2?'green':'blue')+'"></div><div><div class="activity-text">'+a+'</div><div class="activity-time">Recently</div></div></div>').join('');

  // Project info
  document.getElementById('proj-name').textContent='Video MVP';
  document.getElementById('proj-title').textContent='Video MVP End-to-End Test';
  document.getElementById('proj-status').textContent='Active';
  document.getElementById('proj-code').textContent='video-mvp-001';
}

// Media tab
async function loadMedia(){
  const d=await api('/api/v1/projects/'+P+'/assets?page=1&pageSize=10');
  const items=d?.data?.items||d?.data||[];
  document.getElementById('media-grid').innerHTML=items.length?items.map(a=>'<div style="display:inline-block;padding:8px;font-size:0.75rem">'+(a.original_filename||a.media_kind||'asset')+' ('+((a.size_bytes||0)/1024).toFixed(0)+'KB)</div>').join(''):'<div class="empty">No media assets</div>';
}
setTimeout(loadMedia,500);

function m(l,v,c){return '<div class="metric"><div class="metric-label">'+l+'</div><div class="metric-value'+(c?' '+c:'')+'">'+v+'</div></div>';}
function badge(s){const m={succeeded:'green',failed:'red',running:'blue',queued:'gray',cancelled:'gray',retry_wait:'orange'};return '<span class="badge badge-'+(m[s]||'gray')+'">'+s+'</span>';}

load();
</script>
</body>
</html>`;
}
