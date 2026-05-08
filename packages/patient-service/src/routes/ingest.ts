import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { query } from '@ehr/shared';
import { TokenPayload } from '@ehr/shared';
import { ingestQueue } from '../queues';
import { BulkIngestJobData } from '@ehr/shared';

const IngestBody = z.object({
  tenant_id: z.string().min(1),
  patient_ids: z.array(z.string()).optional(),
  resources: z.array(z.enum([
    'Patient', 'Encounter', 'MedicationRequest', 'Condition', 'DocumentReference',
  ])).min(1),
});

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/patients/ingest',
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const user = (request as FastifyRequest & { user: TokenPayload }).user;
      const body = IngestBody.safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: body.error.issues });
      }

      const { tenant_id, patient_ids, resources } = body.data;

      // Upsert tenant
      await query(
        `INSERT INTO tenants (slug, fhir_base_url)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO NOTHING`,
        [tenant_id, process.env.FHIR_BASE_URL ?? '']
      );

      const jobId = uuid();

      // Track job in DB
      await query(
        `INSERT INTO jobs (id, type, status, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          jobId,
          'bulk-ingest',
          'queued',
          JSON.stringify({ tenantId: tenant_id, patientFhirIds: patient_ids, resources }),
        ]
      );

      const jobData: BulkIngestJobData = {
        jobId,
        tenantId: tenant_id,
        patientFhirIds: patient_ids,
        resources: resources as string[],
      };

      await ingestQueue.add('bulk-ingest', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      return reply.code(202).send({
        job_id: jobId,
        status: 'queued',
        estimated_records: patient_ids?.length ?? 'unknown',
        status_url: `/api/v1/jobs/${jobId}`,
      });
    }
  );
}
