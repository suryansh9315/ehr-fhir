import { Worker, Job } from 'bullmq';
import { v4 as uuid } from 'uuid';
import {
  NoteExtractJobData,
  query,
  getRedis,
  getBullMQRedis,
  CHANNELS,
  createLogger,
} from '@ehr/shared';
import {
  ClaudeExtractor,
  preprocessNote,
  scoreAll,
} from '@ehr/nlp-pipeline';

const logger = createLogger('note-extract-worker');

const extractor = new ClaudeExtractor();

async function process(job: Job<NoteExtractJobData>): Promise<void> {
  const { documentId, patientId, noteText, noteType } = job.data;

  logger.info('Starting note extraction', { documentId, patientId });

  // Load patient context
  const patientResult = await query(
    'SELECT demographics FROM patients WHERE id = $1',
    [patientId]
  );
  const demographics = patientResult.rows[0]?.demographics ?? {};

  let age: number | undefined;
  if (demographics.dob) {
    age = Math.floor(
      (Date.now() - new Date(demographics.dob as string).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000)
    );
  }

  const patientContext = {
    age,
    gender: demographics.gender as string | undefined,
    conditions: [],
  };

  const cleanedNote = preprocessNote(noteText);
  const result = await extractor.extract(cleanedNote, patientContext, noteType);
  const scoredActions = scoreAll(result.actions);

  for (const action of scoredActions) {
    await query(
      `INSERT INTO extracted_actions
         (id, document_id, patient_id, action_type, details, confidence, verbatim_source, urgency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [
        uuid(),
        documentId,
        patientId,
        action.type,
        JSON.stringify(action.details),
        action.confidence,
        action.verbatim_source,
        action.urgency,
      ]
    );
  }

  // Mark document as processed
  await query(
    'UPDATE clinical_documents SET processed_at = NOW() WHERE id = $1',
    [documentId]
  );

  // Publish event
  const redis = getRedis();
  await redis.publish(
    CHANNELS.ACTION_EXTRACTED,
    JSON.stringify({ documentId, patientId, actionCount: scoredActions.length })
  );

  logger.info('Note extraction complete', { documentId, actionCount: scoredActions.length });
}

export function createNoteExtractWorker() {
  const worker = new Worker<NoteExtractJobData>('note-extract', process, {
    connection: getBullMQRedis(),
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.info('Note extract job completed', { documentId: job.data.documentId });
  });

  worker.on('failed', (job, err) => {
    logger.error('Note extract job failed', { err, documentId: job?.data.documentId });
  });

  return worker;
}
