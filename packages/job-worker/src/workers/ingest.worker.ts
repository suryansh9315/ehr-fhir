import { Worker, Job } from 'bullmq';
import { v4 as uuid } from 'uuid';
import {
  BulkIngestJobData,
  query,
  getRedis,
  getBullMQRedis,
  uploadDocument,
  CHANNELS,
  createLogger,
} from '@ehr/shared';
import {
  createFHIRClientFromEnv,
  normalizePatient,
  normalizeEncounter,
  normalizeMedication,
  normalizeCondition,
  FHIRBundle,
  FHIRPatient,
  FHIREncounter,
  FHIRMedicationRequest,
  FHIRCondition,
} from '@ehr/fhir-client';

const logger = createLogger('ingest-worker');

async function process(job: Job<BulkIngestJobData>): Promise<void> {
  const { jobId, tenantId, patientFhirIds } = job.data;

  logger.info('Starting bulk ingest', { jobId, tenantId });

  // Update job status to processing
  await query(
    "UPDATE jobs SET status = 'processing' WHERE id = $1",
    [jobId]
  );

  // Get tenant DB id
  const tenantResult = await query(
    'SELECT id FROM tenants WHERE slug = $1',
    [tenantId]
  );
  if (tenantResult.rowCount === 0) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }
  const tenantDbId = tenantResult.rows[0].id;

  const fhirClient = createFHIRClientFromEnv(tenantId);

  // Resolve patient IDs to process
  let fhirIds: string[] = patientFhirIds ?? [];
  if (fhirIds.length === 0) {
    logger.info('No patient IDs provided — fetching all from FHIR', { tenantId });
    const bundle = await fhirClient.searchPatients({ _count: '100' });
    fhirIds = (bundle.entry ?? []).map((e) => (e.resource as FHIRPatient).id!).filter(Boolean);
  }

  const total = fhirIds.length;
  let completed = 0;
  let failed = 0;

  for (const fhirId of fhirIds) {
    try {
      // Fetch patient
      const fhirPatient = await fhirClient.getPatient(fhirId);
      const patient = normalizePatient(fhirPatient, tenantId);

      // Upsert patient
      const patientResult = await query(
        `INSERT INTO patients (id, fhir_id, tenant_id, mrn, demographics)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (fhir_id, tenant_id)
         DO UPDATE SET mrn = EXCLUDED.mrn, demographics = EXCLUDED.demographics, updated_at = NOW()
         RETURNING id`,
        [patient.id, fhirId, tenantDbId, patient.mrn ?? null, JSON.stringify(patient.demographics)]
      );
      const patientDbId = patientResult.rows[0].id;

      // Fetch and upsert encounters
      const encBundle: FHIRBundle = await fhirClient.getEncounters(fhirId);
      for (const entry of encBundle.entry ?? []) {
        const enc = normalizeEncounter(entry.resource as FHIREncounter, patientDbId);
        await query(
          `INSERT INTO encounters (id, patient_id, fhir_id, type, period_start, period_end, status, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING`,
          [enc.id, enc.patientId, enc.fhirId, enc.type ?? null,
           enc.periodStart ?? null, enc.periodEnd ?? null, enc.status ?? null,
           JSON.stringify(enc.data)]
        );
      }

      // Fetch and upsert medications
      const medBundle: FHIRBundle = await fhirClient.getMedications(fhirId);
      for (const entry of medBundle.entry ?? []) {
        const med = normalizeMedication(entry.resource as FHIRMedicationRequest, patientDbId);
        await query(
          `INSERT INTO medications (id, patient_id, fhir_id, name, dosage, status, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [med.id, med.patientId, med.fhirId, med.name ?? null,
           med.dosage ?? null, med.status ?? null, JSON.stringify(med.data)]
        );
      }

      // Fetch and upsert conditions
      const condBundle: FHIRBundle = await fhirClient.getConditions(fhirId);
      for (const entry of condBundle.entry ?? []) {
        const cond = normalizeCondition(entry.resource as FHIRCondition, patientDbId);
        await query(
          `INSERT INTO conditions (id, patient_id, fhir_id, code, display, onset_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [cond.id, cond.patientId, cond.fhirId, cond.code ?? null,
           cond.display ?? null, cond.onsetDate ?? null, cond.status ?? null]
        );
      }

      // Store raw FHIR bundle in MinIO for audit
      const s3Key = `fhir/${tenantId}/${fhirId}/${Date.now()}.json`;
      await uploadDocument(
        s3Key,
        JSON.stringify({ patient: fhirPatient, encounters: encBundle, medications: medBundle, conditions: condBundle }),
        'application/json'
      );

      // Write sync log
      await query(
        `INSERT INTO sync_log (tenant_id, resource_type, direction, status, fhir_resource_id)
         VALUES ((SELECT id FROM tenants WHERE slug = $1), 'Patient', 'inbound', 'success', $2)`,
        [tenantId, fhirId]
      );

      // Publish event
      const redis = getRedis();
      await redis.publish(CHANNELS.PATIENT_INGESTED, JSON.stringify({ tenantId, patientDbId, fhirId }));

      completed++;
    } catch (err) {
      logger.error('Failed to ingest patient', { err, fhirId });
      failed++;

      await query(
        `INSERT INTO sync_log (tenant_id, resource_type, direction, status, fhir_resource_id, error)
         VALUES ((SELECT id FROM tenants WHERE slug = $1), 'Patient', 'inbound', 'failed', $2, $3)`,
        [tenantId, fhirId, (err as Error).message]
      );
    }

    // Update progress
    await query(
      "UPDATE jobs SET progress = $1 WHERE id = $2",
      [JSON.stringify({ total, completed, failed }), jobId]
    );
  }

  const finalStatus = failed === total ? 'failed' : 'completed';
  await query(
    "UPDATE jobs SET status = $1, completed_at = NOW() WHERE id = $2",
    [finalStatus, jobId]
  );

  logger.info('Bulk ingest complete', { jobId, total, completed, failed });
}

export function createIngestWorker() {
  const worker = new Worker<BulkIngestJobData>('bulk-ingest', process, {
    connection: getBullMQRedis(),
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    logger.info('Ingest job completed', { jobId: job.data.jobId });
  });

  worker.on('failed', (job, err) => {
    logger.error('Ingest job failed', { err, jobId: job?.data.jobId });
  });

  return worker;
}
