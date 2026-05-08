import { FastifyInstance } from 'fastify';
import { checkConnection, checkRedisConnection } from '@ehr/shared';
import Groq from 'groq-sdk';

let groqHealthy: boolean | null = null;
let groqCheckedAt = 0;
const GROQ_CACHE_TTL = 60_000; // 1 minute

async function checkGroq(): Promise<boolean> {
  if (groqHealthy !== null && Date.now() - groqCheckedAt < GROQ_CACHE_TTL) {
    return groqHealthy;
  }
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    await client.chat.completions.create({
      model: process.env.GROQ_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    groqHealthy = true;
  } catch {
    groqHealthy = false;
  }
  groqCheckedAt = Date.now();
  return groqHealthy;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    const [postgres, redis, groq] = await Promise.all([
      checkConnection(),
      checkRedisConnection(),
      checkGroq(),
    ]);

    const status = postgres && redis ? 'ok' : 'degraded';
    return reply.code(status === 'ok' ? 200 : 503).send({
      status,
      service: 'nlp-pipeline',
      timestamp: new Date().toISOString(),
      checks: {
        postgres: postgres ? 'ok' : 'error',
        redis: redis ? 'ok' : 'error',
        groq: groq ? 'ok' : 'error',
      },
    });
  });
}
