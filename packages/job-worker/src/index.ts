import 'dotenv/config';
import { createLogger, closePool, closeRedis, ensureBucket } from '@ehr/shared';
import { createIngestWorker } from './workers/ingest.worker';
import { createNoteExtractWorker } from './workers/noteExtract.worker';
import { createWritebackWorker } from './workers/writeback.worker';

const logger = createLogger('job-worker');

async function main() {
  logger.info('Starting job-worker...');

  // Ensure MinIO bucket exists
  try {
    await ensureBucket();
  } catch (err) {
    logger.warn('Could not ensure MinIO bucket — continuing anyway', { err });
  }

  const workers = [
    createIngestWorker(),
    createNoteExtractWorker(),
    createWritebackWorker(),
  ];

  logger.info('All workers started', { workers: workers.length });

  async function shutdown() {
    logger.info('Shutting down workers...');
    await Promise.all(workers.map((w) => w.close()));
    await closePool();
    await closeRedis();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting job-worker:', err);
  process.exit(1);
});
