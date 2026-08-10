import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { config } from './config/index.js';
import { logger } from './core/logging/index.js';
import { correlationIdPlugin } from './plugins/correlation-id.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { requestLoggerPlugin } from './plugins/request-logger.js';
import { authenticationPlugin } from './plugins/authentication.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { csrfPlugin } from './plugins/csrf.js';
import { registerRoutes } from './routes/index.js';
import { redis } from './infrastructure/redis/index.js';
import { shutdownPostgres } from './infrastructure/database/index.js';
import { shutdownRedis } from './infrastructure/redis/index.js';

const app = Fastify({ logger: false, bodyLimit: 1048576, requestIdHeader: 'x-request-id' });

await app.register(cookie);
await app.register(formbody);
await app.register(cors, { origin: false });
await app.register(correlationIdPlugin);
await app.register(errorHandlerPlugin);
await app.register(requestLoggerPlugin);
await app.register(authenticationPlugin);
await app.register(csrfPlugin);
await app.register(rateLimitPlugin);
await app.register(swagger, {
  openapi: {
    info: { title: 'AIĐiLàm API', version: '0.1.0' },
    servers: [{ url: 'http://aidilam-app:3000' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'AIĐiLàm Service Token',
          description: 'Service token in format: aidl_<prefix>_<secret>',
        },
      },
    },
  },
});
await app.register(swaggerUi, { routePrefix: '/documentation' });
await registerRoutes(app);

// Deny-by-default: after all routes are registered, add a catch-all hook
// that denies access to any /api/v1/* route that didn't explicitly authorize.
// This is enforced by the authentication plugin + per-route requirePermission calls.
// Routes without requirePermission will get anonymous identity which is denied by authorization helpers.

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down...`);
  await app.close();
  await shutdownPostgres();
  await shutdownRedis();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await redis.connect();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info('AIĐiLàm API started', { port: config.port, authMode: config.auth.mode });
} catch (err) {
  logger.error('Failed to start', { error: (err as Error).message });
  process.exit(1);
}
