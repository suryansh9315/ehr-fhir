import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { query } from '@ehr/shared';
import { writebackQueue } from '../queues';
import { EhrWritebackJobData } from '@ehr/shared';

const CarePlanBody = z.object({
  encounter_id: z.string().uuid(),
  updates: z.array(z.object({
    type: z.string(),
    action: z.enum(['add', 'update', 'remove']),
    data: z.record(z.unknown()),
  })).min(1),
});

export async function carePlanRoutes(app: FastifyInstance): Promise<void> {
  app.put(
    '/api/v1/patients/:id/care-plan',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = CarePlanBody.safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: body.error.issues });
      }

      const { encounter_id, updates } = body.data;

      // Validate patient exists
      const patientResult = await query(
        'SELECT id, fhir_id, tenant_id FROM patients WHERE id = $1',
        [id]
      );
      if (patientResult.rowCount === 0) {
        return reply.code(404).send({ error: 'Patient not found' });
      }
      const patient = patientResult.rows[0];

      // Validate encounter exists for this patient
      const encResult = await query(
        'SELECT id, fhir_id FROM encounters WHERE id = $1 AND patient_id = $2',
        [encounter_id, id]
      );
      if (encResult.rowCount === 0) {
        return reply.code(404).send({ error: 'Encounter not found for this patient' });
      }
      const encounter = encResult.rows[0];

      const jobId = uuid();

      await query(
        `INSERT INTO jobs (id, type, status, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          jobId,
          'ehr-writeback',
          'queued',
          JSON.stringify({ patientId: id, encounterId: encounter_id, updates }),
        ]
      );

      const jobData: EhrWritebackJobData = {
        jobId,
        patientId: id,
        patientFhirId: patient.fhir_id,
        encounterId: encounter_id,
        encounterFhirId: encounter.fhir_id,
        tenantId: patient.tenant_id,
        updates,
      };

      await writebackQueue.add('ehr-writeback', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      return reply.code(202).send({
        job_id: jobId,
        status: 'queued',
        status_url: `/api/v1/jobs/${jobId}`,
      });
    }
  );
}
