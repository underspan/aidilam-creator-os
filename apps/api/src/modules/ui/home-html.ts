/**
 * Home — Creator Control Center HTML
 * AIDILAM-UX-003
 */

export function homeHtml(projects: Array<{ id: string; code: string; name: string; status: string }>, jobCounts: Record<string, number>): string {
  const totalJobs = Object.values(jobCounts).reduce((a, b) => a + b, 0);
  const running = jobCounts['running'] || 0;
  const succeeded = jobCounts['succeeded'] || 0;
  const queued = jobCounts['queued'] || 0;

  const recentProjects = projects.slice(0, 5).map(p => `
    <a href="/projects/${p.id}/dashboard" class="recent-item">
      <div class="recent-icon">📁</div>
      <div class="recent-info"><div class="recent-name">${p.name}</div><div class="recent-code">${p.code}</div></div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIĐiLàm Creator OS</title>
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
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-sm);color:var(--text2);font-size:0.82rem;font-weight:500;transition:all 0.15s;margin:1px 0}
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

.main{margin-left:260px;flex:1;padding:32px 40px;min-height:100vh}
.greeting{margin-bottom:32px}
.greeting h2{font-size:1.7rem;font-weight:800;letter-spacing:-0.5px}
.greeting p{color:var(--text2);font-size:0.88rem;margin-top:4px}

.quick-actions{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:36px}
.qa-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;cursor:pointer;transition:all 0.2s}
.qa-card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:var(--shadow)}
.qa-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px}
.qa-icon.purple{background:linear-gradient(135deg,rgba(108,99,255,0.15),rgba(124,58,237,0.1))}
.qa-icon.blue{background:linear-gradient(135deg,rgba(59,130,246,0.15),rgba(59,130,246,0.05))}
.qa-icon.green{background:linear-gradient(135deg,rgba(34,197,94,0.15),rgba(34,197,94,0.05))}
.qa-icon.orange{background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05))}
.qa-label{font-size:0.78rem;font-weight:600;color:var(--text)}
.qa-sub{font-size:0.65rem;color:var(--text3)}

.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:36px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px 18px}
.stat-label{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);margin-bottom:4px}
.stat-value{font-size:1.5rem;font-weight:800;letter-spacing:-0.5px}
.stat-value.green{color:var(--green)}.stat-value.blue{color:var(--blue)}.stat-value.orange{color:var(--orange)}

.section{margin-bottom:32px}
.section-title{font-size:0.9rem;font-weight:700;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}
.section-title a{font-size:0.75rem;color:var(--accent);font-weight:500}

.recent-item{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;transition:all 0.15s}
.recent-item:hover{border-color:var(--border-hover);background:var(--surface2)}
.recent-icon{font-size:1.2rem}
.recent-info{flex:1}
.recent-name{font-size:0.82rem;font-weight:600}
.recent-code{font-size:0.68rem;color:var(--text3);font-family:monospace}
.recent-item svg{color:var(--text3)}

.worker-status{display:flex;align-items:center;gap:10px;padding:14px 18px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm)}
.worker-dot{width:10px;height:10px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
.worker-label{font-size:0.82rem;font-weight:500}
.worker-sub{font-size:0.7rem;color:var(--text3)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}

.table-wrap{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:0.8rem}
th{text-align:left;padding:10px 14px;background:var(--surface2);color:var(--text3);font-weight:600;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.5px}
td{padding:10px 14px;border-top:1px solid var(--border)}
.empty-cell{text-align:center;color:var(--text3);padding:24px}
.progress-bar{height:4px;background:var(--surface2);border-radius:2px;overflow:hidden;width:80px}
.progress-fill{height:100%;background:var(--accent);border-radius:2px;transition:width 0.3s}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:600;text-transform:uppercase}
.badge-green{background:rgba(34,197,94,0.12);color:var(--green)}
.badge-blue{background:rgba(59,130,246,0.12);color:var(--blue)}
.badge-red{background:rgba(239,68,68,0.12);color:var(--red)}
.badge-gray{background:rgba(90,101,122,0.12);color:var(--text3)}
.review-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.empty-widget{text-align:center;padding:32px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text3);font-size:0.82rem}

@media(max-width:768px){.sidebar{display:none}.main{margin-left:0;padding:20px}.quick-actions{grid-template-columns:repeat(2,1fr)}.stats{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
${sidebarHtml('home')}
<main class="main">
  <div class="greeting">
    <h2>Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, Creator 👋</h2>
    <p>AIĐiLàm Creator OS — Your video production command center</p>
  </div>

  <div class="quick-actions">
    <a class="qa-card" href="/projects/${projects[0]?.id || ''}/dashboard"><div class="qa-icon purple">🎬</div><div class="qa-label">Create Video</div><div class="qa-sub">New from source</div></a>
    <a class="qa-card" href="/projects"><div class="qa-icon blue">📁</div><div class="qa-label">Projects</div><div class="qa-sub">Browse all</div></a>
    <a class="qa-card" href="/projects/${projects[0]?.id || ''}/dashboard"><div class="qa-icon green">✓</div><div class="qa-label">Reviews</div><div class="qa-sub">${jobCounts['succeeded'] || 0} ready</div></a>
    <a class="qa-card" href="/projects/${projects[0]?.id || ''}/dashboard"><div class="qa-icon orange">📊</div><div class="qa-label">Analytics</div><div class="qa-sub">Coming Soon</div></a>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-label">Total Jobs</div><div class="stat-value">${totalJobs}</div></div>
    <div class="stat"><div class="stat-label">Running</div><div class="stat-value blue">${running}</div></div>
    <div class="stat"><div class="stat-label">Completed</div><div class="stat-value green">${succeeded}</div></div>
    <div class="stat"><div class="stat-label">Queued</div><div class="stat-value orange">${queued}</div></div>
    <div class="stat"><div class="stat-label">Projects</div><div class="stat-value">${projects.length}</div></div>
  </div>

  <div class="section">
    <div class="section-title">Worker Status</div>
    <div class="worker-status">
      <div class="worker-dot"></div>
      <div><div class="worker-label">Healthy — Ready</div><div class="worker-sub">1 worker active • Queue idle</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Recent Projects <a href="/projects">View All →</a></div>
    ${recentProjects || '<div class="empty-widget"><p>No projects yet</p></div>'}
  </div>

  <div class="section">
    <div class="section-title">Recent Jobs</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Job</th><th>Stage</th><th>Progress</th><th>Status</th></tr></thead>
        <tbody id="jobs-body"><tr><td colspan="4" class="empty-cell">Loading jobs...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Need Review</div>
    <div class="review-cards" id="review-cards">
      <div class="empty-widget">
        <div style="font-size:2rem;margin-bottom:8px">✓</div>
        <p>No videos waiting for review</p>
      </div>
    </div>
  </div>
</main>
<script>
// Load recent jobs
fetch('/api/v1/projects/${projects[0]?.id || ''}/dashboard',{credentials:'same-origin'})
  .then(r=>r.json()).then(d=>{
    const jobs=d.data?.recentJobs||[];
    const tbody=document.getElementById('jobs-body');
    if(!jobs.length){tbody.innerHTML='<tr><td colspan="4" class="empty-cell">No jobs yet. Create your first video!</td></tr>';return;}
    tbody.innerHTML=jobs.slice(0,8).map(j=>'<tr><td>'+j.job_type+'</td><td>'+(j.current_stage||'—')+'</td><td><div class="progress-bar"><div class="progress-fill" style="width:'+(j.progress_percent||0)+'%"></div></div></td><td><span class="badge badge-'+(j.status==='succeeded'?'green':j.status==='failed'?'red':j.status==='running'?'blue':'gray')+'">'+j.status+'</span></td></tr>').join('');
  }).catch(()=>{});
</script>
</body>
</html>`;
}

export function sidebarHtml(active: string): string {
  const items = [
    { id: 'home', label: 'Home', href: '/home', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { id: 'projects', label: 'Projects', href: '/projects', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8l-2 4h12l-2-4z"/></svg>' },
    { id: 'jobs', label: 'Video Jobs', href: '#', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>' },
    { id: 'media', label: 'Media Library', href: '#', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' },
    { id: 'reviews', label: 'Reviews', href: '#', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
    { id: 'analytics', label: 'Analytics', href: '#', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
    { id: 'workers', label: 'Worker Monitor', href: '#', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
    { id: 'settings', label: 'Settings', href: '#', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
  ];

  return `<aside class="sidebar">
  <div class="sidebar-brand"><div class="logo">A</div><div><h1>AIĐiLàm</h1><span>Creator OS v1</span></div></div>
  <nav class="sidebar-nav">
    ${items.map(i => `<a class="nav-item${i.id === active ? ' active' : ''}" href="${i.href}">${i.icon}${i.label}</a>`).join('')}
    <div class="nav-section">Quick Actions</div>
    <a class="nav-item" href="#">${items[0].icon}Create Video</a>
    <a class="nav-item" href="#">${items[3].icon}Templates</a>
  </nav>
  <div class="sidebar-footer">
    <div class="user-row"><div class="user-avatar">O</div><div><div class="user-name">Owner</div><div class="user-role">System Admin</div></div></div>
    <button class="btn-logout" onclick="fetch('/logout',{method:'POST',headers:{'X-CSRF-Token':document.cookie.match(/aidilam_csrf=([^;]+)/)?.[1]||''},credentials:'same-origin'}).then(()=>location.href='/login')">Sign Out</button>
  </div>
</aside>`;
}
