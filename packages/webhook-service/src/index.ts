import 'dotenv/config';
import { buildApp } from './app';
import { createLogger, closePool, closeRedis } from '@ehr/shared';

const logger = createLogger('webhook-service');
const PORT = parseInt(process.env.PORT ?? '3003', 10);

async function main() {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info('webhook-service started', { port: PORT });
  } catch (err) {
    logger.error('Failed to start webhook-service', { err });
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down webhook-service...');
  await closePool();
  await closeRedis();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main();
