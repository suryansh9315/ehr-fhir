import Fastify, { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { jwtMiddleware, createLogger } from '@ehr/shared';
import { healthRoutes } from './routes/health';
import { ingestRoutes } from './routes/ingest';
import { patientRoutes } from './routes/patients';
import { jobRoutes } from './routes/jobs';
import { carePlanRoutes } from './routes/carePlan';

const logger = createLogger('patient-service');

export function buildApp() {
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });

  // Auth middleware on all routes except /health
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') return;
    await jwtMiddleware(request, reply);
  });

  app.register(healthRoutes);
  app.register(ingestRoutes);
  app.register(patientRoutes);
  app.register(jobRoutes);
  app.register(carePlanRoutes);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    logger.error('Unhandled error', { err: error });
    reply.code(error.statusCode ?? 500).send({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    });
  });

  return app;
}
