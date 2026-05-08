// Service entrypoint
import 'dotenv/config';
import { buildApp } from './app';
import { createLogger, closePool, closeRedis } from '@ehr/shared';

const logger = createLogger('nlp-pipeline');
const PORT = parseInt(process.env.PORT ?? '3002', 10);

async function main() {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info('nlp-pipeline started', { port: PORT });
  } catch (err) {
    logger.error('Failed to start nlp-pipeline', { err });
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down nlp-pipeline...');
  await closePool();
  await closeRedis();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main();

// Export shared NLP utilities for use by job-worker
export { ClaudeExtractor } from './claude/ClaudeExtractor';
export type { RawAction, ExtractionResult, PatientContext } from './claude/ClaudeExtractor';
export { EXTRACT_CLINICAL_ACTIONS_TOOL } from './claude/tools';
export { SYSTEM_PROMPT } from './claude/prompts';
export { preprocessNote } from './preprocessing/NotePreprocessor';
export { scoreAll, scoreAction } from './validation/ActionValidator';
export type { ScoredAction } from './validation/ActionValidator';
