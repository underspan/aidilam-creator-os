import { FastifyInstance } from 'fastify';
import { checkPostgres } from '../../../infrastructure/database/index.js';
import { checkRedis } from '../../../infrastructure/redis/index.js';
import { checkQdrant } from '../../../infrastructure/qdrant/index.js';
import { checkMinio } from '../../../infrastructure/minio/index.js';
import { requirePermission } from '../../security/domain/authorization.js';
import { config } from '../../../config/index.js';

export async function systemRoutes(app: FastifyInstance) {
  // Unauthenticated - minimal liveness probe
  app.get('/health/live', {
    schema: {
      tags: ['health'],
      description: 'Liveness probe - no authentication required',
    },
  }, async () => ({ status: 'ok', service: 'aidilam-app' }));

  // Unauthenticated - readiness probe (minimal info)
  app.get('/health/ready', {
    schema: {
      tags: ['health'],
      description: 'Readiness probe - no authentication required',
    },
  }, async () => ({ status: 'ok' }));

  // Authenticated - deep health with dependency status
  app.get('/health/deep', {
    schema: {
      tags: ['health'],
      description: 'Deep health check with dependency status - requires system.read',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    await requirePermission(request, 'system.read');

    const [pg, rd, qd, mn] = await Promise.all([checkPostgres(), checkRedis(), checkQdrant(), checkMinio()]);
    const allOk = pg && rd && qd && mn;
    reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      dependencies: {
        postgres: pg ? 'ok' : 'error',
        redis: rd ? 'ok' : 'error',
        qdrant: qd ? 'ok' : 'error',
        minio: mn ? 'ok' : 'error',
      },
      security: {
        authMode: config.auth.mode,
        publicExposure: config.auth.publicExposure,
      },
    });
  });

  // Authenticated - system info
  app.get('/api/v1/system/info', {
    schema: {
      tags: ['system'],
      description: 'System information - requires system.read',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    await requirePermission(request, 'system.read');
    return {
      data: {
        service: 'aidilam-app',
        version: '0.1.0',
        environment: process.env.NODE_ENV,
        authMode: config.auth.mode,
      },
      meta: { requestId: request.id },
    };
  });
}
