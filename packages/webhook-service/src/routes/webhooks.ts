import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import { v4 as uuid } from 'uuid';
import { getBullMQRedis, query, createLogger } from '@ehr/shared';
import { BulkIngestJobData } from '@ehr/shared';
import crypto from 'crypto';

const logger = createLogger('webhook-service');

const ingestQueue = new Queue('bulk-ingest', { connection: getBullMQRedis() });

function verifyHmacSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // skip validation if no secret configured (local dev)
  if (!signature) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // FHIR Subscription notification handler
  app.post(
    '/webhooks/fhir',
    {
      config: { rawBody: true }, // needed for HMAC validation
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawBody = JSON.stringify(request.body);
      const signature = request.headers['x-hub-signature'] as string | undefined;

      if (!verifyHmacSignature(rawBody, signature)) {
        logger.warn('Webhook HMAC validation failed', { ip: request.ip });
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      const body = request.body as Record<string, unknown>;

      // Extract patient reference from notification bundle
      let patientFhirId: string | null = null;
      try {
        const entries = (body.entry as Array<{ resource?: Record<string, unknown> }>) ?? [];
        for (const entry of entries) {
          const resource = entry.resource;
          if (!resource) continue;

          // Look for patient reference in various resource types
          const subjectRef = (resource.subject as { reference?: string })?.reference
            ?? (resource.patient as { reference?: string })?.reference;

          if (subjectRef?.startsWith('Patient/')) {
            patientFhirId = subjectRef.replace('Patient/', '');
            break;
          }
        }
      } catch (err) {
        logger.warn('Could not parse patient from webhook payload', { err });
      }

      // Deduplication key
      const dedupKey = `webhook:${body.id ?? uuid()}`;
      const redis = (await import('@ehr/shared')).getRedis();
      const alreadyProcessed = await redis.set(dedupKey, '1', 'EX', 3600, 'NX');

      if (!alreadyProcessed) {
        logger.info('Duplicate webhook — skipping', { dedupKey });
        return reply.send({ received: true, deduplicated: true });
      }

      // Get tenant info
      const tenantId = (request.headers['x-tenant-id'] as string) ?? 'epic-sandbox';

      const jobId = uuid();
      await query(
        `INSERT INTO jobs (id, type, status, payload)
         VALUES ($1, $2, 'queued', $3)`,
        [jobId, 'bulk-ingest', JSON.stringify({ source: 'webhook', patientFhirId })]
      );

      const jobData: BulkIngestJobData = {
        jobId,
        tenantId,
        patientFhirIds: patientFhirId ? [patientFhirId] : undefined,
        resources: ['Patient', 'Encounter', 'MedicationRequest', 'Condition'],
      };

      await ingestQueue.add('bulk-ingest', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      logger.info('Webhook enqueued sync job', { patientFhirId, tenantId, jobId });

      return reply.send({ received: true, job_id: jobId });
    }
  );
}
