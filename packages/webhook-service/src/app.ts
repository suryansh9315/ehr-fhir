import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createLogger } from '@ehr/shared';
import { healthRoutes } from './routes/health';
import { webhookRoutes } from './routes/webhooks';

const logger = createLogger('webhook-service');

export function buildApp() {
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });

  // Webhook routes do NOT use JWT — they use HMAC signature verification
  app.register(healthRoutes);
  app.register(webhookRoutes);

  app.setErrorHandler((error, _request, reply) => {
    logger.error('Unhandled error', { err: error });
    reply.code(error.statusCode ?? 500).send({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    });
  });

  return app;
}
