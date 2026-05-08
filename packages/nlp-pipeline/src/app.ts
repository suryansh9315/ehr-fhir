import Fastify, { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { jwtMiddleware, createLogger } from '@ehr/shared';
import { healthRoutes } from './routes/health';
import { extractRoutes } from './routes/extract';

const logger = createLogger('nlp-pipeline');

export function buildApp() {
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') return;
    await jwtMiddleware(request, reply);
  });

  app.register(healthRoutes);
  app.register(extractRoutes);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    logger.error('Unhandled error', { err: error });
    reply.code(error.statusCode ?? 500).send({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    });
  });

  return app;
}
