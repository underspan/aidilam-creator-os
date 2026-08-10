/**
 * UI Routes — HTML pages for browser navigation
 * Clean separation: /projects, /projects/:id/dashboard, etc. → HTML
 * API stays at /api/v1/* → JSON
 */
import { FastifyInstance } from 'fastify';
import { pgPool } from '../../infrastructure/database/index.js';
import { homeHtml } from './home-html.js';
import { studioRoutes } from './studio.js';
import { jobsReviewRoutes } from './jobs-reviews.js';
import { v1ClosureRoutes } from './v1-closure.js';
import { workspaceRoutes } from './workspace.js';
import { customTemplateRoutes } from './custom-templates.js';
import { damRoutes } from './dam-api.js';
import { workflowRoutes } from '../workflow/routes.js';

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

export async function uiRoutes(app: FastifyInstance) {

  // Register sub-routes
  await app.register(studioRoutes);
  await app.register(jobsReviewRoutes);
  await app.register(v1ClosureRoutes);
  await app.register(workspaceRoutes);
  await app.register(customTemplateRoutes);
  await app.register(damRoutes);
  await app.register(workflowRoutes);

  // =========================================================================
  // GET / — Creator Control Center (Home)
  // =========================================================================
  app.get('/', { schema: { tags: ['ui'] } }, async (request, reply) => {
    const userId = await getSessionUserId(request);
    if (!userId) { reply.redirect('/login'); return; }

    const [jobsRes, projectsRes] = await Promise.all([
      pgPool.query(`SELECT status, count(*)::int as cnt FROM aidilam_app.jobs GROUP BY status`),
      pgPool.query(`SELECT id, code, name, status FROM aidilam_app.projects ORDER BY updated_at DESC LIMIT 10`),
    ]);
    const jobCounts: Record<string, number> = {};
    for (const r of jobsRes.rows) jobCounts[r.status] = r.cnt;

    reply.type('text/html')
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .send(homeHtml(projectsRes.rows, jobCounts));
  });

  // =========================================================================
  // GET /home — Alias to /
  // =========================================================================
  app.get('/home', { schema: { tags: ['ui'] } }, async (request, reply) => {
    const userId = await getSessionUserId(request);
    if (!userId) { reply.redirect('/login'); return; }

    const [jobsRes, projectsRes] = await Promise.all([
      pgPool.query(`SELECT status, count(*)::int as cnt FROM aidilam_app.jobs GROUP BY status`),
      pgPool.query(`SELECT id, code, name, status FROM aidilam_app.projects ORDER BY updated_at DESC LIMIT 10`),
    ]);
    const jobCounts: Record<string, number> = {};
    for (const r of jobsRes.rows) jobCounts[r.status] = r.cnt;

    reply.type('text/html')
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .send(homeHtml(projectsRes.rows, jobCounts));
  });

  // =========================================================================
  // GET /projects — Project selection page (HTML)
  // =========================================================================
  app.get('/projects', { schema: { tags: ['ui'] } }, async (request, reply) => {
    const userId = await getSessionUserId(request);
    if (!userId) { reply.redirect('/login'); return; }

    const projects = await pgPool.query(
      `SELECT p.id, p.code, p.name, p.status FROM aidilam_app.projects p
       ORDER BY p.name ASC LIMIT 50`
    );

    const rows = projects.rows;

    // If exactly one project, redirect directly to its dashboard
    if (rows.length === 1) {
      reply.redirect(`/projects/${rows[0].id}/dashboard`);
      return;
    }

    reply.type('text/html')
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .send(projectSelectionHtml(rows));
  });

  // =========================================================================
  // GET /projects/:projectId/dashboard — Dashboard page (HTML)
  // =========================================================================
  app.get('/projects/:projectId/dashboard', { schema: { tags: ['ui'] } }, async (request, reply) => {
    const userId = await getSessionUserId(request);
    if (!userId) {
      const { projectId } = request.params as { projectId: string };
      reply.redirect(`/login?return_to=/projects/${projectId}/dashboard`);
      return;
    }
    const { projectId } = request.params as { projectId: string };
    // Import and serve the dashboard HTML
    const { dashboardHtml } = await import('../dashboard/api/dashboard-html.js');
    reply.type('text/html')
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'")
      .send(dashboardHtml(projectId));
  });

  // =========================================================================
}
function projectSelectionHtml(projects: Array<{ id: string; code: string; name: string; status: string }>): string {
  const cards = projects.map(p => `
    <a href="/projects/${p.id}/dashboard" class="card">
      <div class="card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
      <div class="card-body">
        <h3>${p.name}</h3>
        <span class="card-code">${p.code}</span>
        <div class="card-meta">
          <span class="badge badge-${p.status === 'active' ? 'green' : p.status === 'draft' ? 'blue' : 'orange'}">${p.status}</span>
        </div>
      </div>
      <div class="card-action">
        <span class="btn-open">Open Dashboard →</span>
      </div>
    </a>
  `).join('');

  const emptyState = projects.length === 0 ? `
    <div class="empty">
      <div class="empty-icon">📁</div>
      <h2>No projects yet</h2>
      <p>Create your first project to start producing videos</p>
      <button class="btn-primary">Create Project</button>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIĐiLàm Creator OS — Projects</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
:root{--bg:#0B0F19;--surface:#121826;--surface2:#1B2433;--surface3:#232d3f;--border:#2a3548;--border-hover:#3d4f6a;--text:#f0f2f5;--text2:#8b95a8;--text3:#5a657a;--accent:#6C63FF;--accent2:#7C3AED;--accent-glow:rgba(108,99,255,0.15);--green:#22C55E;--blue:#3B82F6;--orange:#F59E0B;--red:#EF4444;--radius:16px;--radius-sm:10px;--radius-xs:6px;--shadow:0 4px 24px rgba(0,0,0,0.3);--shadow-lg:0 8px 40px rgba(0,0,0,0.4);--transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}

/* Sidebar */
.sidebar{width:260px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100}
.sidebar-brand{padding:24px;display:flex;align-items:center;gap:12px}
.sidebar-brand .logo{width:32px;height:32px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff}
.sidebar-brand h1{font-size:0.95rem;font-weight:700;letter-spacing:-0.3px}
.sidebar-nav{flex:1;padding:8px 12px;overflow-y:auto}
.nav-section{padding:16px 12px 6px;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);color:var(--text2);font-size:0.85rem;font-weight:500;text-decoration:none;transition:var(--transition);margin:2px 0}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.active{background:var(--accent-glow);color:var(--accent);font-weight:600}
.nav-item svg{width:18px;height:18px;opacity:0.7}
.nav-item.active svg{opacity:1}
.sidebar-footer{padding:16px;border-top:1px solid var(--border)}
.user-info{display:flex;align-items:center;gap:10px;padding:8px}
.user-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff}
.user-name{font-size:0.8rem;font-weight:500}
.user-role{font-size:0.7rem;color:var(--text3)}
.btn-logout{display:block;width:100%;padding:8px;margin-top:8px;background:transparent;border:1px solid var(--border);border-radius:var(--radius-xs);color:var(--text2);font-size:0.75rem;cursor:pointer;transition:var(--transition)}
.btn-logout:hover{border-color:var(--red);color:var(--red)}

/* Main */
.main{margin-left:260px;flex:1;padding:32px 40px;min-height:100vh}
.header{margin-bottom:32px}
.header h2{font-size:1.8rem;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}
.header p{color:var(--text2);font-size:0.9rem}
.header-actions{display:flex;gap:12px;margin-top:20px;align-items:center}
.search-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 16px;color:var(--text);font-size:0.85rem;width:280px;outline:none;transition:var(--transition)}
.search-box:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
.search-box::placeholder{color:var(--text3)}
.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:none;padding:10px 20px;border-radius:var(--radius-sm);font-size:0.85rem;font-weight:600;cursor:pointer;transition:var(--transition)}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(108,99,255,0.3)}

/* Metrics */
.metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:32px}
.metric{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;transition:var(--transition)}
.metric:hover{border-color:var(--border-hover)}
.metric-label{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);margin-bottom:6px}
.metric-value{font-size:1.6rem;font-weight:800;letter-spacing:-0.5px}
.metric-value.green{color:var(--green)}
.metric-value.blue{color:var(--blue)}

/* Project Grid */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;text-decoration:none;color:var(--text);transition:var(--transition);cursor:pointer}
.card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:var(--shadow)}
.card-icon{width:40px;height:40px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--accent-glow),rgba(124,58,237,0.1));display:flex;align-items:center;justify-content:center;color:var(--accent);margin-bottom:16px}
.card-body{flex:1}
.card-body h3{font-size:1rem;font-weight:700;margin-bottom:4px;letter-spacing:-0.2px}
.card-code{font-size:0.75rem;color:var(--text3);font-family:'JetBrains Mono',monospace}
.card-meta{margin-top:12px;display:flex;gap:8px;align-items:center}
.badge{padding:3px 8px;border-radius:4px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.3px}
.badge-green{background:rgba(34,197,94,0.1);color:var(--green)}
.badge-blue{background:rgba(59,130,246,0.1);color:var(--blue)}
.badge-orange{background:rgba(245,158,11,0.1);color:var(--orange)}
.card-action{margin-top:16px;padding-top:16px;border-top:1px solid var(--border)}
.btn-open{font-size:0.8rem;color:var(--accent);font-weight:600;transition:var(--transition)}
.card:hover .btn-open{color:var(--text)}

/* Empty */
.empty{text-align:center;padding:80px 20px}
.empty-icon{font-size:3rem;margin-bottom:16px;opacity:0.5}
.empty h2{font-size:1.3rem;margin-bottom:8px}
.empty p{color:var(--text2);margin-bottom:24px}

/* Responsive */
@media(max-width:1024px){.sidebar{width:220px}.main{margin-left:220px;padding:24px}}
@media(max-width:768px){.sidebar{display:none}.main{margin-left:0;padding:20px}.grid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<aside class="sidebar">
  <div class="sidebar-brand"><div class="logo">A</div><h1>AIĐiLàm</h1></div>
  <nav class="sidebar-nav">
    <a class="nav-item active" href="/projects"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8l-2 4h12l-2-4z"/></svg>Projects</a>
    <div class="nav-section">Shortcuts</div>
    <a class="nav-item" href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>Create Video</a>
    <a class="nav-item" href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Import URL</a>
  </nav>
  <div class="sidebar-footer">
    <div class="user-info"><div class="user-avatar">O</div><div><div class="user-name">Owner</div><div class="user-role">System Admin</div></div></div>
    <button class="btn-logout" onclick="fetch('/logout',{method:'POST',headers:{'X-CSRF-Token':document.cookie.match(/aidilam_csrf=([^;]+)/)?.[1]||''},credentials:'same-origin'}).then(()=>location.href='/login')">Sign Out</button>
  </div>
</aside>
<main class="main">
  <div class="header">
    <h2>Projects</h2>
    <p>Select a project to open the Creator Dashboard</p>
    <div class="header-actions">
      <input type="text" class="search-box" placeholder="Search projects... (Ctrl+K)" id="search">
      <button class="btn-primary">+ New Project</button>
    </div>
  </div>
  <div class="metrics">
    <div class="metric"><div class="metric-label">Total Projects</div><div class="metric-value">${projects.length}</div></div>
    <div class="metric"><div class="metric-label">Active</div><div class="metric-value green">${projects.filter(p => p.status === 'active').length}</div></div>
    <div class="metric"><div class="metric-label">Draft</div><div class="metric-value blue">${projects.filter(p => p.status === 'draft').length}</div></div>
  </div>
  ${emptyState}
  <div class="grid" id="project-grid">${cards}</div>
</main>
<script>
document.getElementById('search')?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.card').forEach(c => {
    c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});
document.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('search')?.focus(); }});
</script>
</body>
</html>`;
}
