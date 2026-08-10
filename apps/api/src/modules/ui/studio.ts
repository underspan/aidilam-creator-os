/**
 * Create Video Studio — Premium Guided Video Creation
 * AIDILAM-UX-003C
 */
import { FastifyInstance } from 'fastify';
import { pgPool } from '../../infrastructure/database/index.js';

const SESSION_COOKIE = 'aidilam_session';

async function getSessionUserId(request: any): Promise<string | null> {
  const sessionId = request.cookies?.[SESSION_COOKIE];
  if (!sessionId) return null;
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(sessionId).digest('hex');
  const res = await pgPool.query(
    `SELECT user_id FROM aidilam_app.browser_sessions WHERE session_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hash]
  );
  return res.rows[0]?.user_id || null;
}

export async function studioRoutes(app: FastifyInstance) {

  app.get('/create-video', { schema: { tags: ['ui'] } }, async (request, reply) => {
    const userId = await getSessionUserId(request);
    if (!userId) { reply.redirect('/login'); return; }
    const projects = await pgPool.query(`SELECT id, code, name FROM aidilam_app.projects ORDER BY name LIMIT 20`);
    reply.type('text/html').header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
      .send(studioHtml(null, projects.rows));
  });

  app.get('/projects/:projectId/create-video', { schema: { tags: ['ui'] } }, async (request, reply) => {
    const userId = await getSessionUserId(request);
    if (!userId) { reply.redirect('/login'); return; }
    const { projectId } = request.params as { projectId: string };
    const projects = await pgPool.query(`SELECT id, code, name FROM aidilam_app.projects ORDER BY name LIMIT 20`);
    reply.type('text/html').header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
      .send(studioHtml(projectId, projects.rows));
  });
}

function studioHtml(projectId: string | null, projects: Array<{id: string; code: string; name: string}>): string {
  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${p.name} (${p.code})</option>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AIĐiLàm — Create Video</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#0B0F19;--surface:#121826;--surface2:#1B2433;--border:#2a3548;--text:#f0f2f5;--text2:#8b95a8;--text3:#5a657a;--accent:#6C63FF;--accent2:#7C3AED;--green:#22C55E;--orange:#F59E0B;--red:#EF4444;--radius:14px;--radius-sm:8px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
a{color:var(--accent);text-decoration:none}

.studio{display:grid;grid-template-columns:220px 1fr 280px;min-height:100vh}
@media(max-width:1024px){.studio{grid-template-columns:1fr;}.steps-nav,.summary{display:none}}

.steps-nav{background:var(--surface);border-right:1px solid var(--border);padding:24px 16px}
.steps-nav h2{font-size:0.85rem;font-weight:700;margin-bottom:20px;padding:0 8px}
.step-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);font-size:0.8rem;color:var(--text3);margin-bottom:4px;cursor:pointer;transition:all 0.15s}
.step-item:hover{background:var(--surface2);color:var(--text)}
.step-item.active{background:rgba(108,99,255,0.1);color:var(--accent);font-weight:600}
.step-item.done{color:var(--green)}
.step-num{width:24px;height:24px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;flex-shrink:0}
.step-item.active .step-num{border-color:var(--accent);background:var(--accent);color:#fff}
.step-item.done .step-num{border-color:var(--green);background:var(--green);color:#fff}

.main-panel{padding:32px 40px;overflow-y:auto}
.main-panel h1{font-size:1.4rem;font-weight:800;letter-spacing:-0.3px;margin-bottom:4px}
.main-panel .subtitle{color:var(--text2);font-size:0.85rem;margin-bottom:28px}

.step-content{display:none}
.step-content.active{display:block}

.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:12px;cursor:pointer;transition:all 0.15s}
.card:hover{border-color:var(--accent);transform:translateY(-1px)}
.card.selected{border-color:var(--accent);box-shadow:0 0 0 2px rgba(108,99,255,0.2)}
.card.disabled{opacity:0.4;cursor:not-allowed;pointer-events:none}
.card h3{font-size:0.88rem;font-weight:600;margin-bottom:4px}
.card p{font-size:0.75rem;color:var(--text3)}
.card .badge-soon{font-size:0.6rem;background:var(--surface2);color:var(--text3);padding:2px 6px;border-radius:3px;margin-left:8px}

.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:0.75rem;color:var(--text2);margin-bottom:6px;font-weight:500}
.form-group select,.form-group input{width:100%;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:0.82rem;font-family:inherit}
.form-group select:focus,.form-group input:focus{outline:none;border-color:var(--accent)}

.upload-zone{border:2px dashed var(--border);border-radius:var(--radius);padding:40px;text-align:center;cursor:pointer;transition:all 0.2s}
.upload-zone:hover{border-color:var(--accent);background:rgba(108,99,255,0.03)}
.upload-zone h3{font-size:0.9rem;margin-bottom:6px}
.upload-zone p{font-size:0.75rem;color:var(--text3)}

.provider-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}

.btn-row{display:flex;gap:10px;margin-top:24px}
.btn{padding:10px 20px;border-radius:var(--radius-sm);font-size:0.82rem;font-weight:600;border:none;cursor:pointer;transition:all 0.15s;font-family:inherit}
.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(108,99,255,0.3)}
.btn-secondary{background:transparent;border:1px solid var(--border);color:var(--text2)}
.btn-secondary:hover{border-color:var(--text2);color:var(--text)}
.btn:disabled{opacity:0.4;cursor:not-allowed;transform:none;box-shadow:none}

.summary{background:var(--surface);border-left:1px solid var(--border);padding:24px 20px;font-size:0.78rem}
.summary h3{font-size:0.82rem;font-weight:700;margin-bottom:16px}
.summary-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(42,53,72,0.4)}
.summary-label{color:var(--text3)}
.summary-value{color:var(--text);font-weight:500}
.summary .note{margin-top:16px;padding:10px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.15);border-radius:var(--radius-sm);font-size:0.7rem;color:var(--orange)}

#status-msg{margin-top:16px;padding:12px;border-radius:var(--radius-sm);font-size:0.8rem;display:none}
#status-msg.success{display:block;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:var(--green)}
#status-msg.error{display:block;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:var(--red)}
</style></head><body>
<div class="studio">
<nav class="steps-nav">
  <h2>Create Video</h2>
  <div class="step-item active" onclick="goStep(1)"><div class="step-num">1</div>Source</div>
  <div class="step-item" onclick="goStep(2)"><div class="step-num">2</div>Language</div>
  <div class="step-item" onclick="goStep(3)"><div class="step-num">3</div>Translation</div>
  <div class="step-item" onclick="goStep(4)"><div class="step-num">4</div>Voice</div>
  <div class="step-item" onclick="goStep(5)"><div class="step-num">5</div>Video Style</div>
  <div class="step-item" onclick="goStep(6)"><div class="step-num">6</div>Review & Create</div>
  <div style="margin-top:24px;padding:12px;font-size:0.7rem;color:var(--text3)"><a href="/">← Back to Home</a></div>
</nav>

<main class="main-panel">
<h1>Create Video</h1>
<p class="subtitle">Turn a source video into a localized, review-ready video.</p>

<!-- STEP 1: SOURCE -->
<div class="step-content active" id="step-1">
<h2 style="font-size:1rem;font-weight:700;margin-bottom:16px">Select Source</h2>
<div class="form-group"><label>Project</label><select id="sel-project">${projectOptions}</select></div>
<div class="upload-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
  <h3>📁 Upload Source Video</h3>
  <p>Drag and drop or click to browse • MP4, MOV, WEBM</p>
  <input type="file" id="file-input" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" style="display:none">
</div>
<div id="file-info" style="display:none;margin-top:12px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.8rem"></div>
<div class="provider-grid" style="margin-top:16px">
  <div class="card disabled"><h3>Import URL<span class="badge-soon">Coming Soon</span></h3><p>YouTube, TikTok, Douyin</p></div>
</div>
<div class="btn-row"><button class="btn btn-primary" onclick="goStep(2)" id="btn-next-1" disabled>Next →</button></div>
</div>

<!-- STEP 2: LANGUAGE -->
<div class="step-content" id="step-2">
<h2 style="font-size:1rem;font-weight:700;margin-bottom:16px">Language Settings</h2>
<div class="form-group"><label>Source Language</label><select id="sel-source-lang"><option value="zh">Chinese (Auto-detect)</option><option value="en">English</option><option value="ja">Japanese</option><option value="ko">Korean</option></select></div>
<div class="form-group"><label>Target Language</label><select id="sel-target-lang"><option value="vi">Vietnamese</option></select></div>
<div style="padding:12px;background:var(--surface);border-radius:var(--radius-sm);font-size:0.75rem;color:var(--text3);margin-top:8px">STT Provider: <strong style="color:var(--text)">faster-whisper</strong> (local inference)</div>
<div class="btn-row"><button class="btn btn-secondary" onclick="goStep(1)">← Back</button><button class="btn btn-primary" onclick="goStep(3)">Next →</button></div>
</div>

<!-- STEP 3: TRANSLATION -->
<div class="step-content" id="step-3">
<h2 style="font-size:1rem;font-weight:700;margin-bottom:16px">Translation Provider</h2>
<div class="provider-grid">
  <div class="card selected" id="card-google"><h3>Google Translate</h3><p>Free • Automated NMT • No API key</p></div>
  <div class="card disabled"><h3>OpenAI<span class="badge-soon">Coming Soon</span></h3><p>GPT-4 quality</p></div>
  <div class="card disabled"><h3>Gemini<span class="badge-soon">Coming Soon</span></h3><p>Google AI</p></div>
  <div class="card disabled"><h3>Claude<span class="badge-soon">Coming Soon</span></h3><p>Anthropic</p></div>
  <div class="card disabled"><h3>DeepSeek<span class="badge-soon">Coming Soon</span></h3><p>Open model</p></div>
</div>
<div class="btn-row"><button class="btn btn-secondary" onclick="goStep(2)">← Back</button><button class="btn btn-primary" onclick="goStep(4)">Next →</button></div>
</div>

<!-- STEP 4: VOICE -->
<div class="step-content" id="step-4">
<h2 style="font-size:1rem;font-weight:700;margin-bottom:16px">Voice Selection</h2>
<div class="provider-grid">
  <div class="card selected"><h3>🎤 HoaiMy (Female)</h3><p>Vietnamese • Microsoft Edge TTS • Natural</p></div>
  <div class="card" onclick="this.classList.toggle('selected');document.querySelector('.card.selected')?.classList.remove('selected');this.classList.add('selected')"><h3>🎤 NamMinh (Male)</h3><p>Vietnamese • Microsoft Edge TTS • Natural</p></div>
</div>
<div style="padding:12px;background:var(--surface);border-radius:var(--radius-sm);font-size:0.75rem;color:var(--text3);margin-top:12px">Provider: <strong style="color:var(--text)">Microsoft Edge TTS</strong> (online, free, no API key)</div>
<div class="btn-row"><button class="btn btn-secondary" onclick="goStep(3)">← Back</button><button class="btn btn-primary" onclick="goStep(5)">Next →</button></div>
</div>

<!-- STEP 5: VIDEO STYLE -->
<div class="step-content" id="step-5">
<h2 style="font-size:1rem;font-weight:700;margin-bottom:16px">Video Style</h2>
<div class="provider-grid">
  <div class="card selected"><h3>📱 Portrait 9:16</h3><p>1080×1920 • TikTok/Reels/Shorts</p></div>
  <div class="card disabled"><h3>🖥 Landscape 16:9<span class="badge-soon">Coming Soon</span></h3><p>1920×1080 • YouTube</p></div>
</div>
<div class="form-group" style="margin-top:16px"><label>Subtitles</label><select><option>Burned-in (Vietnamese)</option></select></div>
<div class="form-group"><label>Original Audio</label><select><option>Ducked (15% volume)</option><option>Muted</option><option>Preserved</option></select></div>
<div class="btn-row"><button class="btn btn-secondary" onclick="goStep(4)">← Back</button><button class="btn btn-primary" onclick="goStep(6)">Next →</button></div>
</div>

<!-- STEP 6: REVIEW & CREATE -->
<div class="step-content" id="step-6">
<h2 style="font-size:1rem;font-weight:700;margin-bottom:16px">Review & Create</h2>
<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;font-size:0.8rem;line-height:2">
  <div><strong>Project:</strong> <span id="review-project">—</span></div>
  <div><strong>Source:</strong> <span id="review-source">—</span></div>
  <div><strong>Language:</strong> <span id="review-lang">Chinese → Vietnamese</span></div>
  <div><strong>Translation:</strong> Google Translate (automated)</div>
  <div><strong>Voice:</strong> vi-VN-HoaiMyNeural (Edge TTS)</div>
  <div><strong>Output:</strong> 1080×1920 (9:16) • H.264/AAC • Subtitles burned-in</div>
  <div><strong>Publishing:</strong> <span style="color:var(--orange)">Disabled — local review only</span></div>
</div>
<div id="status-msg"></div>
<div class="btn-row"><button class="btn btn-secondary" onclick="goStep(5)">← Back</button><button class="btn btn-primary" id="btn-create" onclick="createVideo()">🚀 Create Video</button></div>
</div>
</main>

<aside class="summary">
<h3>Summary</h3>
<div class="summary-row"><span class="summary-label">Project</span><span class="summary-value" id="sum-project">—</span></div>
<div class="summary-row"><span class="summary-label">Source</span><span class="summary-value" id="sum-source">—</span></div>
<div class="summary-row"><span class="summary-label">Source Lang</span><span class="summary-value">Chinese</span></div>
<div class="summary-row"><span class="summary-label">Target Lang</span><span class="summary-value">Vietnamese</span></div>
<div class="summary-row"><span class="summary-label">Translator</span><span class="summary-value">Google NMT</span></div>
<div class="summary-row"><span class="summary-label">Voice</span><span class="summary-value">HoaiMy</span></div>
<div class="summary-row"><span class="summary-label">Output</span><span class="summary-value">9:16 1080×1920</span></div>
<div class="note">⚠ Publishing is disabled. Video will be available for local review only.</div>
</aside>
</div>

<script>
let currentStep=1,uploadedAssetId=null,templateId=new URLSearchParams(window.location.search).get('template');
const csrf=document.cookie.match(/aidilam_csrf=([^;]+)/)?.[1]||'';

function goStep(n){
  document.querySelectorAll('.step-content').forEach(e=>e.classList.remove('active'));
  document.getElementById('step-'+n).classList.add('active');
  document.querySelectorAll('.step-item').forEach((e,i)=>{e.classList.remove('active');e.classList.toggle('done',i<n-1);if(i===n-1)e.classList.add('active');});
  currentStep=n;
  if(n===6)updateReview();
}

document.getElementById('file-input').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  document.getElementById('file-info').style.display='block';
  document.getElementById('file-info').innerHTML='Uploading: '+file.name+' ('+Math.round(file.size/1024/1024*10)/10+' MB)...';
  const pid=document.getElementById('sel-project').value;
  try{
    const init=await fetch('/api/v1/projects/'+pid+'/assets/initiate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({filename:file.name,contentType:file.type||'video/mp4',sizeBytes:file.size,purpose:'source_video'})}).then(r=>r.json());
    if(!init.data)throw new Error(init.error?.message||'Upload init failed');
    const url=init.data.uploadUrl;
    await fetch(url,{method:'PUT',headers:{'Content-Type':file.type||'video/mp4'},body:file});
    const cs=await computeSha256(file);
    await fetch('/api/v1/projects/'+pid+'/assets/'+init.data.assetId+'/complete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({checksumSha256:cs})});
    uploadedAssetId=init.data.assetId;
    document.getElementById('file-info').innerHTML='✓ '+file.name+' uploaded successfully';
    document.getElementById('btn-next-1').disabled=false;
    document.getElementById('sum-source').textContent=file.name;
  }catch(err){document.getElementById('file-info').innerHTML='❌ Upload failed: '+err.message;}
});

async function computeSha256(file){const buf=await file.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}

function updateReview(){
  const proj=document.getElementById('sel-project');
  document.getElementById('review-project').textContent=proj.options[proj.selectedIndex]?.text||'—';
  document.getElementById('review-source').textContent=uploadedAssetId?'Uploaded asset':'—';
  document.getElementById('sum-project').textContent=proj.options[proj.selectedIndex]?.text?.split('(')[0]||'—';
}

async function createVideo(){
  const btn=document.getElementById('btn-create');
  btn.disabled=true;btn.textContent='Creating...';
  const msg=document.getElementById('status-msg');
  const pid=document.getElementById('sel-project').value;
  const srcLang=document.getElementById('sel-source-lang').value;
  const tgtLang=document.getElementById('sel-target-lang').value;
  try{
    const r=await fetch('/api/v1/projects/'+pid+'/video-pipeline',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({sourceAssetId:uploadedAssetId,templateId:templateId||undefined,sourceLanguage:srcLang,targetLanguage:tgtLang,voiceCode:'vi-VN-HoaiMyNeural',idempotencyKey:'studio-'+Date.now()})});
    const d=await r.json();
    if(d.data?.jobId){msg.className='success';msg.textContent='✓ Video job created! Redirecting...';setTimeout(()=>location.href='/projects/'+pid+'/dashboard',1500);}
    else{throw new Error(d.error?.message||'Failed');}
  }catch(err){msg.className='error';msg.textContent='Error: '+err.message;btn.disabled=false;btn.textContent='🚀 Create Video';}
}

document.getElementById('sel-project').addEventListener('change',()=>{document.getElementById('sum-project').textContent=document.getElementById('sel-project').options[document.getElementById('sel-project').selectedIndex]?.text?.split('(')[0]||'—';});
</script></body></html>`;
}
