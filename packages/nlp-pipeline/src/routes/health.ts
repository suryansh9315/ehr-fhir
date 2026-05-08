import { FastifyInstance } from 'fastify';
import { checkConnection, checkRedisConnection } from '@ehr/shared';
import Anthropic from '@anthropic-ai/sdk';

let claudeHealthy: boolean | null = null;
let claudeCheckedAt = 0;
const CLAUDE_CACHE_TTL = 60_000; // 1 minute

async function checkClaude(): Promise<boolean> {
  if (claudeHealthy !== null && Date.now() - claudeCheckedAt < CLAUDE_CACHE_TTL) {
    return claudeHealthy;
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    claudeHealthy = true;
  } catch {
    claudeHealthy = false;
  }
  claudeCheckedAt = Date.now();
  return claudeHealthy;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    const [postgres, redis, claude] = await Promise.all([
      checkConnection(),
      checkRedisConnection(),
      checkClaude(),
    ]);

    const status = postgres && redis ? 'ok' : 'degraded';
    return reply.code(status === 'ok' ? 200 : 503).send({
      status,
      service: 'nlp-pipeline',
      timestamp: new Date().toISOString(),
      checks: {
        postgres: postgres ? 'ok' : 'error',
        redis: redis ? 'ok' : 'error',
        claude: claude ? 'ok' : 'error',
      },
    });
  });
}
