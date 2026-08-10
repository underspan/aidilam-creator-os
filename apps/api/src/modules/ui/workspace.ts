/**
 * Commercial Foundation — Multi-Workspace Architecture
 * AIDILAM-COM-04A
 *
 * Workspace-aware UI layer on top of existing project infrastructure.
 * No backend schema changes — workspace = logical grouping of projects.
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

function workspaceShell(title: string, subtitle: string, content: string, activeSidebar: string = 'home'): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>AIĐiLàm — ${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>:root{--bg:#0B0F19;--surface:#121826;--surface2:#1B2433;--border:#2a3548;--text:#f0f2f5;--text2:#8b95a8;--text3:#5a657a;--accent:#6C63FF;--accent2:#7C3AED;--green:#22C55E;--blue:#3B82F6;--orange:#F59E0B;--red:#EF4444;--radius:14px;--radius-sm:8px}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}a{text-decoration:none;color:inherit}
.sidebar{width:260px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100}.sidebar-brand{padding:24px 20px;display:flex;align-items:center;gap:12px}.sidebar-brand .logo{width:34px;height:34px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff}.sidebar-brand h1{font-size:0.9rem;font-weight:700}.sidebar-brand span{font-size:0.6rem;color:var(--text3);display:block;margin-top:2px}
.ws-switcher{margin:0 12px 12px;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;align-items:center;gap:10px;cursor:pointer;transition:all 0.15s}.ws-switcher:hover{border-color:var(--accent)}.ws-avatar{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,var(--green),var(--blue));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}.ws-info{flex:1}.ws-name{font-size:0.78rem;font-weight:600}.ws-code{font-size:0.62rem;color:var(--text3)}
.sidebar-nav{flex:1;padding:4px 12px;overflow-y:auto}.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-sm);color:var(--text2);font-size:0.82rem;font-weight:500;transition:all 0.15s;margin:1px 0;cursor:pointer}.nav-item:hover{background:var(--surface2);color:var(--text)}.nav-item.active{background:rgba(108,99,255,0.1);color:var(--accent);font-weight:600}.nav-item svg{width:17px;height:17px;flex-shrink:0}.nav-section{padding:20px 12px 6px;font-size:0.6rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--text3);font-weight:600}
.sidebar-footer{padding:14px 16px;border-top:1px solid var(--border)}.user-row{display:flex;align-items:center;gap:10px;padding:6px}.user-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}.user-name{font-size:0.78rem;font-weight:500}.user-role{font-size:0.65rem;color:var(--text3)}.btn-logout{display:block;width:100%;padding:7px;margin-top:8px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:0.7rem;cursor:pointer;font-family:inherit}.btn-logout:hover{border-color:var(--red);color:var(--red)}
.main{margin-left:260px;flex:1;padding:28px 32px;min-height:100vh}.header{margin-bottom:24px}.header h2{font-size:1.4rem;font-weight:800;letter-spacing:-0.3px}.header p{color:var(--text2);font-size:0.82rem;margin-top:4px}.breadcrumb{font-size:0.75rem;color:var(--text3);margin-bottom:12px}.breadcrumb a{color:var(--text2)}.breadcrumb a:hover{color:var(--text)}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}.panel h3{font-size:0.85rem;font-weight:700;margin-bottom:12px}
.metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:24px}.metric{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px}.metric-label{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.4px;color:var(--text3);margin-bottom:3px}.metric-value{font-size:1.3rem;font-weight:800}.metric-value.green{color:var(--green)}.metric-value.blue{color:var(--blue)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:1024px){.grid-2{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:0.78rem}th{text-align:left;padding:8px 12px;color:var(--text3);font-weight:600;font-size:0.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)}td{padding:9px 12px;border-bottom:1px solid rgba(42,53,72,0.4)}
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.62rem;font-weight:600}.badge-green{background:rgba(34,197,94,0.1);color:var(--green)}.badge-blue{background:rgba(59,130,246,0.1);color:var(--blue)}.badge-gray{background:rgba(90,101,122,0.1);color:var(--text3)}.badge-orange{background:rgba(245,158,11,0.1);color:var(--orange)}
.setting-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(42,53,72,0.3);font-size:0.8rem}.setting-label{color:var(--text2)}.setting-value{font-weight:500}
.coming-soon{font-size:0.62rem;background:var(--surface2);color:var(--text3);padding:2px 6px;border-radius:3px}
.empty{text-align:center;padding:32px;color:var(--text3);font-size:0.82rem}
.ws-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;transition:all 0.15s;cursor:pointer;display:block}.ws-card:hover{border-color:var(--accent);transform:translateY(-2px)}.ws-card h3{font-size:1rem;font-weight:700;margin-bottom:6px}.ws-card p{font-size:0.78rem;color:var(--text3)}.ws-card .ws-stats{display:flex;gap:16px;margin-top:12px;font-size:0.72rem;color:var(--text2)}
@media(max-width:768px){.sidebar{display:none}.main{margin-left:0;padding:16px}.metrics{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<aside class="sidebar">
<div class="sidebar-brand"><div class="logo">A</div><div><h1>AIĐiLàm</h1><span>Creator OS</span></div></div>
<div class="ws-switcher"><div class="ws-avatar">W</div><div class="ws-info"><div class="ws-name">AIĐiLàm Studio</div><div class="ws-code">Default Workspace</div></div></div>
<nav class="sidebar-nav">
<a class="nav-item${activeSidebar==='home'?' active':''}" href="/">Home</a>
<a class="nav-item${activeSidebar==='workspaces'?' active':''}" href="/workspaces">Workspaces</a>
<a class="nav-item${activeSidebar==='projects'?' active':''}" href="/projects">Projects</a>
<a class="nav-item${activeSidebar==='media'?' active':''}" href="/media">Media</a>
<a class="nav-item${activeSidebar==='analytics'?' active':''}" href="/analytics">Analytics</a>
<a class="nav-item${activeSidebar==='settings'?' active':''}" href="/settings">Settings</a>
<div class="nav-section">Operations</div>
<a class="nav-item${activeSidebar==='jobs'?' active':''}" href="/video-jobs">Video Jobs</a>
<a class="nav-item${activeSidebar==='reviews'?' active':''}" href="/reviews">Reviews</a>
<a class="nav-item${activeSidebar==='workers'?' active':''}" href="/worker-monitor">Workers</a>
<div class="nav-section">Create</div>
<a class="nav-item" href="/create-video">+ Create Video</a>
</nav>
<div class="sidebar-footer"><div class="user-row"><div class="user-avatar">O</div><div><div class="user-name">Owner</div><div class="user-role">Workspace Admin</div></div></div><button class="btn-logout" onclick="fetch('/logout',{method:'POST',headers:{'X-CSRF-Token':document.cookie.match(/aidilam_csrf=([^;]+)/)?.[1]||''},credentials:'same-origin'}).then(()=>location.href='/login')">Sign Out</button></div>
</aside>
<main class="main">${content}</main></body></html>`;
}

export async function workspaceRoutes(app: FastifyInstance) {

  // === WORKSPACES LIST ===
  app.get('/workspaces', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const projects = await pgPool.query(`SELECT count(*)::int as cnt FROM aidilam_app.projects`);
    const users = await pgPool.query(`SELECT count(*)::int as cnt FROM aidilam_app.users WHERE status='active'`);
    const content = `
<div class="header"><h2>Workspaces</h2><p>Manage your Creator OS workspaces</p></div>
<a class="ws-card" href="/workspaces/default">
  <h3>AIĐiLàm Studio</h3>
  <p>Default workspace • Creator video production</p>
  <div class="ws-stats"><span>${projects.rows[0]?.cnt || 0} projects</span><span>${users.rows[0]?.cnt || 0} members</span><span>Active</span></div>
</a>`;
    reply.type('text/html').header('Cache-Control', 'no-store').send(workspaceShell('Workspaces', '', content, 'workspaces'));
  });

  // === WORKSPACE DETAIL ===
  app.get('/workspaces/:workspaceId', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const projects = await pgPool.query(`SELECT id, code, name, status FROM aidilam_app.projects ORDER BY name LIMIT 20`);
    const users = await pgPool.query(`SELECT id, email, display_name, status FROM aidilam_app.users WHERE status='active' ORDER BY display_name LIMIT 20`);
    const content = `
<div class="breadcrumb"><a href="/workspaces">Workspaces</a> › AIĐiLàm Studio</div>
<div class="header"><h2>AIĐiLàm Studio</h2><p>Default workspace overview</p></div>
<div class="metrics">
  <div class="metric"><div class="metric-label">Projects</div><div class="metric-value">${projects.rows.length}</div></div>
  <div class="metric"><div class="metric-label">Members</div><div class="metric-value blue">${users.rows.length}</div></div>
  <div class="metric"><div class="metric-label">Status</div><div class="metric-value green">Active</div></div>
</div>
<div class="grid-2">
<div class="panel"><h3>Projects</h3><table><thead><tr><th>Name</th><th>Code</th><th>Status</th></tr></thead><tbody>${projects.rows.map(p => `<tr><td><a href="/projects/${p.id}/dashboard" style="color:var(--accent)">${p.name}</a></td><td style="font-family:monospace;font-size:0.72rem">${p.code}</td><td><span class="badge badge-${p.status==='active'?'green':'blue'}">${p.status}</span></td></tr>`).join('')}</tbody></table></div>
<div class="panel"><h3>Members</h3><table><thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead><tbody>${users.rows.map(u => `<tr><td>${u.display_name||'—'}</td><td style="font-size:0.72rem">${u.email||'—'}</td><td><span class="badge badge-green">${u.status}</span></td></tr>`).join('')}</tbody></table></div>
</div>`;
    reply.type('text/html').header('Cache-Control', 'no-store').send(workspaceShell('Workspace Detail', '', content, 'workspaces'));
  });

  // === MEMBERS ===
  app.get('/workspaces/:workspaceId/members', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const users = await pgPool.query(`SELECT id, email, display_name, status, created_at FROM aidilam_app.users ORDER BY created_at DESC LIMIT 50`);
    const content = `
<div class="breadcrumb"><a href="/workspaces">Workspaces</a> › <a href="/workspaces/default">AIĐiLàm Studio</a> › Members</div>
<div class="header"><h2>Members</h2><p>Workspace team members and roles</p></div>
<div class="panel"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead><tbody>${users.rows.map(u => `<tr><td>${u.display_name||'—'}</td><td>${u.email||'—'}</td><td><span class="badge badge-blue">Member</span></td><td><span class="badge badge-${u.status==='active'?'green':'gray'}">${u.status}</span></td><td>${new Date(u.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>
<div class="panel"><h3>Invite Members</h3><div class="empty"><span class="coming-soon">Coming Soon</span> — Team invitations will be available in a future update</div></div>`;
    reply.type('text/html').header('Cache-Control', 'no-store').send(workspaceShell('Members', '', content, 'workspaces'));
  });

  // === ROLES ===
  app.get('/workspaces/:workspaceId/roles', { schema: { tags: ['ui'] } }, async (req, reply) => {
    if (!await getSessionUserId(req)) { reply.redirect('/login'); return; }
    const roles = [
      { name: 'Owner', desc: 'Full workspace control', perms: 'All permissions' },
      { name: 'Admin', desc: 'Manage projects and members', perms: 'Projects, Members, Settings' },
      { name: 'Editor', desc: 'Create and edit videos', perms: 'Create, Edit, Media, Jobs' },
      { name: 'Reviewer', desc: 'Review and approve videos', perms: 'Review, Approve, Reject' },
      { name: 'Viewer', desc: 'View-only access', perms: 'Read access only' },
    ];
    const content = `
<div class="breadcrumb"><a href="/workspaces">Workspaces</a> › <a href="/workspaces/default">AIĐiLàm Studio</a> › Roles</div>
<div class="header"><h2>Roles & Permissions</h2><p>Workspace role definitions (read-only)</p></div>
<div class="panel"><table><thead><tr><th>Role</th><th>Description</th><th>Permissions</th></tr></thead><tbody>${roles.map(r => `<tr><td><strong>${r.name}</strong></td><td style="color:var(--text2)">${r.desc}</td><td style="font-size:0.72rem">${r.perms}</td></tr>`).join('')}</tbody></table></div>`;
    reply.type('text/html').header('Cache-Control', 'no-store').send(workspaceShell('Roles', '', content, 'workspaces'));
  });
}
