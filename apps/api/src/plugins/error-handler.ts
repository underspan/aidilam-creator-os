import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../core/errors/index.js';
import { logger } from '../core/logging/index.js';

const errorHandlerPluginFn: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
        meta: { requestId },
      });
      return;
    }

    if (error.validation) {
      reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.validation },
        meta: { requestId },
      });
      return;
    }

    logger.error('Unhandled error', { requestId, error: error.message });
    reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' },
      meta: { requestId },
    });
  });
};

export const errorHandlerPlugin = fp(errorHandlerPluginFn, {
  name: 'aidilam-error-handler',
});
