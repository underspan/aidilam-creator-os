/**
 * Browser Auth Routes — Login, Logout, Session
 * AIDILAM-VIDEOMVP-004R3
 */
import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { BrowserSessionService, authenticateUser } from '../domain/session-service.js';

const SESSION_COOKIE = 'aidilam_session';
const CSRF_COOKIE = 'aidilam_csrf';
const sessionService = new BrowserSessionService(pgPool);

export async function browserAuthRoutes(app: FastifyInstance) {

  // GET /login — Login page HTML
  app.get('/login', { schema: { tags: ['auth'] } }, async (_request, reply) => {
    reply.type('text/html')
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('Referrer-Policy', 'no-referrer')
      .send(loginPageHtml());
  });

  // POST /login — Authenticate and create session
  app.post('/login', {
    schema: {
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const result = await authenticateUser(pgPool, email, password);

    if (!result.success) {
      reply.type('text/html')
        .header('Cache-Control', 'no-store')
        .code(401)
        .send(loginPageHtml(result.error === 'user_disabled' ? 'Account is disabled.' : 'Invalid email or password.'));
      return;
    }

    const session = await sessionService.createSession(
      result.userId!,
      request.ip,
      request.headers['user-agent']
    );

    reply
      .setCookie(SESSION_COOKIE, session.sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 86400, // 24h
        secure: request.protocol === 'https',
      })
      .setCookie(CSRF_COOKIE, session.csrfToken, {
        httpOnly: false, // JS needs to read this for mutation requests
        sameSite: 'lax',
        path: '/',
        maxAge: 86400,
        secure: request.protocol === 'https',
      })
      .redirect('/');
  });

  // POST /logout — Destroy session
  app.post('/logout', { schema: { tags: ['auth'] } }, async (request, reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (sessionId) {
      await sessionService.revokeSession(sessionId);
    }
    reply
      .clearCookie(SESSION_COOKIE, { path: '/' })
      .clearCookie(CSRF_COOKIE, { path: '/' })
      .redirect('/login');
  });

  // GET /api/v1/auth/session — Current session info (JSON)
  app.get('/api/v1/auth/session', { schema: { tags: ['auth'] } }, async (request, reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (!sessionId) {
      reply.code(401).send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
      return;
    }

    const session = await sessionService.validateSession(sessionId);
    if (!session) {
      reply
        .clearCookie(SESSION_COOKIE, { path: '/' })
        .clearCookie(CSRF_COOKIE, { path: '/' })
        .code(401)
        .send({ error: { code: 'SESSION_EXPIRED', message: 'Session expired or revoked' } });
      return;
    }

    // Load user info
    const userRes = await pgPool.query(
      `SELECT id, email, display_name, status FROM aidilam_app.users WHERE id = $1`,
      [session.userId]
    );

    reply.send({
      data: {
        userId: session.userId,
        email: userRes.rows[0]?.email,
        displayName: userRes.rows[0]?.display_name,
        authMethod: session.authMethod,
        expiresAt: session.expiresAt,
      },
    });
  });
}

function loginPageHtml(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIĐiLàm — Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e8e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#12121a;border:1px solid #2a2a3a;border-radius:12px;padding:40px;width:100%;max-width:380px}
h1{font-size:1.3rem;margin-bottom:8px}
p.subtitle{color:#888;font-size:0.85rem;margin-bottom:24px}
label{display:block;font-size:0.8rem;color:#888;margin-bottom:4px;margin-top:16px}
input{width:100%;padding:10px 12px;background:#1a1a25;border:1px solid #333;border-radius:6px;color:#e8e8f0;font-size:0.9rem}
input:focus{outline:none;border-color:#6366f1}
.error{background:#450a0a;color:#fca5a5;padding:8px 12px;border-radius:4px;font-size:0.85rem;margin-bottom:12px}
button{width:100%;padding:12px;background:#6366f1;color:#fff;border:none;border-radius:6px;font-size:0.9rem;font-weight:600;cursor:pointer;margin-top:24px}
button:hover{background:#4f46e5}
.footer{text-align:center;margin-top:16px;font-size:0.75rem;color:#555}
</style>
</head>
<body>
<div class="card">
<h1>AIĐiLàm Creator OS</h1>
<p class="subtitle">Sign in to your account</p>
${error ? `<div class="error">${error}</div>` : ''}
<form method="POST" action="/login">
<label for="email">Email</label>
<input type="email" id="email" name="email" required autofocus autocomplete="email">
<label for="password">Password</label>
<input type="password" id="password" name="password" required autocomplete="current-password">
<button type="submit">Sign In</button>
</form>
<div class="footer">Internal access only. No publishing enabled.</div>
</div>
</body>
</html>`;
}
