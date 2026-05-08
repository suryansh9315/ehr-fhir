import Redis from 'ioredis';
import { createLogger } from '../logger';

const logger = createLogger('redis');

// General-purpose cache client
let redisClient: Redis | null = null;

// Dedicated BullMQ connection (BullMQ uses blocking commands — needs its own connection)
let bullmqRedis: Redis | null = null;

function createRedisConnection(name: string): Redis {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on('connect', () => logger.info('Redis connected', { name }));
  client.on('error', (err) => logger.error('Redis error', { err, name }));

  return client;
}

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = createRedisConnection('cache');
  }
  return redisClient;
}

export function getBullMQRedis(): Redis {
  if (!bullmqRedis) {
    bullmqRedis = createRedisConnection('bullmq');
  }
  return bullmqRedis;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  if (bullmqRedis) {
    await bullmqRedis.quit();
    bullmqRedis = null;
  }
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const r = getRedis();
    await r.connect().catch(() => {}); // no-op if already connected
    const result = await r.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

// Pub/Sub channel names
export const CHANNELS = {
  PATIENT_INGESTED: 'patient.ingested',
  PATIENT_UPDATED: 'patient.updated',
  ACTION_EXTRACTED: 'action.extracted',
  ACTION_APPROVED: 'action.approved',
  SYNC_FAILED: 'sync.failed',
} as const;
