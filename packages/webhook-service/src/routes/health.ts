import { FastifyInstance } from 'fastify';
import { checkConnection, checkRedisConnection } from '@ehr/shared';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    const [postgres, redis] = await Promise.all([
      checkConnection(),
      checkRedisConnection(),
    ]);

    const status = postgres && redis ? 'ok' : 'degraded';
    return reply.code(status === 'ok' ? 200 : 503).send({
      status,
      service: 'webhook-service',
      timestamp: new Date().toISOString(),
      checks: {
        postgres: postgres ? 'ok' : 'error',
        redis: redis ? 'ok' : 'error',
      },
    });
  });
}
