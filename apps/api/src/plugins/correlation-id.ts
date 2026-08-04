import { FastifyPluginAsync } from 'fastify';
import { resolveRequestId } from '../core/request-context/index.js';

export const correlationIdPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    const requestId = resolveRequestId(request.headers['x-request-id'] as string | undefined);
    request.id = requestId;
    reply.header('x-request-id', requestId);
  });
};
