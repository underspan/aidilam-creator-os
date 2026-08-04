import { FastifyPluginAsync } from 'fastify';
import { logger } from '../core/logging/index.js';

export const requestLoggerPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onResponse', async (request, reply) => {
    logger.info('request', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
    });
  });
};
