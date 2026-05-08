import { Worker, Job } from 'bullmq';
import {
  EhrWritebackJobData,
  query,
  getBullMQRedis,
  createLogger,
} from '@ehr/shared';
import { createFHIRClientFromEnv } from '@ehr/fhir-client';
import { buildCarePlan, validateCarePlan } from '../builders/CarePlanBuilder';

const logger = createLogger('writeback-worker');

async function processJob(job: Job<EhrWritebackJobData>): Promise<void> {
  const { jobId, patientId, patientFhirId, tenantId } = job.data;

  logger.info('Starting EHR writeback', { jobId, patientId });

  await query("UPDATE jobs SET status = 'processing' WHERE id = $1", [jobId]);

  // Always construct and validate the CarePlan — tests our FHIR resource builder
  const carePlan = buildCarePlan(job.data);
  validateCarePlan(carePlan); // throws if malformed

  const authType = process.env.FHIR_AUTH_TYPE ?? 'none';

  if (authType === 'none') {
    // Open sandbox is read-only — log warning, mark job as 'skipped'
    const skipMessage =
      'Writeback skipped: FHIR_AUTH_TYPE=none (open.epic.com is read-only). ' +
      'CarePlan constructed and validated successfully but not sent to Epic. ' +
      'Set FHIR_AUTH_TYPE=smart to enable writeback. See README > Epic App Registration.';

    logger.warn(skipMessage, { jobId, carePlanTitle: carePlan.title });

    await query(
      "UPDATE jobs SET status = 'skipped', error = $1, completed_at = NOW() WHERE id = $2",
      [skipMessage, jobId]
    );

    // Log to sync_log
    await query(
      `INSERT INTO sync_log (tenant_id, resource_type, direction, status, error)
       VALUES ((SELECT id FROM tenants WHERE slug = $1), 'CarePlan', 'outbound', 'skipped', $2)`,
      [tenantId, skipMessage]
    );

    return;
  }

  // SMART mode — AuthManager handles token acquisition transparently
  try {
    const fhirClient = createFHIRClientFromEnv(tenantId);
    const result = await fhirClient.createCarePlan(carePlan);

    await query(
      "UPDATE jobs SET status = 'completed', completed_at = NOW() WHERE id = $1",
      [jobId]
    );

    await query(
      `INSERT INTO sync_log (tenant_id, resource_type, direction, status, fhir_resource_id)
       VALUES ((SELECT id FROM tenants WHERE slug = $1), 'CarePlan', 'outbound', 'success', $2)`,
      [tenantId, result.id ?? 'unknown']
    );

    logger.info('CarePlan written to Epic FHIR', { jobId, carePlanId: result.id });
  } catch (err) {
    const errMsg = (err as Error).message;
    logger.error('EHR writeback failed', { err, jobId });

    await query(
      "UPDATE jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2",
      [errMsg, jobId]
    );

    await query(
      `INSERT INTO sync_log (tenant_id, resource_type, direction, status, error)
       VALUES ((SELECT id FROM tenants WHERE slug = $1), 'CarePlan', 'outbound', 'failed', $2)`,
      [tenantId, errMsg]
    );

    throw err; // let BullMQ handle retry
  }
}

export function createWritebackWorker() {
  const worker = new Worker<EhrWritebackJobData>('ehr-writeback', processJob, {
    connection: getBullMQRedis(),
    concurrency: 3,
  });

  worker.on('completed', (job) => {
    logger.info('Writeback job completed', { jobId: job.data.jobId });
  });

  worker.on('failed', (job, err) => {
    logger.error('Writeback job failed', { err, jobId: job?.data.jobId });
  });

  return worker;
}
