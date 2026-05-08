import { Queue } from 'bullmq';
import { getBullMQRedis } from '@ehr/shared';

function makeConnection() {
  return getBullMQRedis();
}

export const ingestQueue = new Queue('bulk-ingest', { connection: makeConnection() });
export const writebackQueue = new Queue('ehr-writeback', { connection: makeConnection() });
export const noteExtractQueue = new Queue('note-extract', { connection: makeConnection() });
