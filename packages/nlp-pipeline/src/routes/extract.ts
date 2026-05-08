import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { query, getRedis, CHANNELS, createLogger } from '@ehr/shared';
import { ClaudeExtractor } from '../claude/ClaudeExtractor';
import { preprocessNote } from '../preprocessing/NotePreprocessor';
import { scoreAll } from '../validation/ActionValidator';

const logger = createLogger('extract-route');
const extractor = new ClaudeExtractor();

const ExtractBody = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional(),
  note_text: z.string().min(10),
  note_type: z.string().default('clinical_note'),
});

export async function extractRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/notes/extract',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = ExtractBody.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: body.error.issues });
      }

      const { patient_id, encounter_id, note_text, note_type } = body.data;

      // Load patient for context
      const patientResult = await query(
        `SELECT p.demographics,
                COALESCE(
                  json_agg(c.display) FILTER (WHERE c.id IS NOT NULL),
                  '[]'
                ) AS conditions
         FROM patients p
         LEFT JOIN conditions c ON c.patient_id = p.id
         WHERE p.id = $1
         GROUP BY p.id, p.demographics`,
        [patient_id]
      );

      if (!patientResult.rowCount || patientResult.rowCount === 0) {
        return reply.code(404).send({ error: 'Patient not found' });
      }

      const patientRow = patientResult.rows[0];
      const demographics = patientRow.demographics ?? {};

      // Calculate approximate age from dob
      let age: number | undefined;
      if (demographics.dob) {
        const dob = new Date(demographics.dob);
        age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      }

      const patientContext = {
        age,
        gender: demographics.gender,
        conditions: (patientRow.conditions as string[]).filter(Boolean),
      };

      // Preprocess note
      const cleanedNote = preprocessNote(note_text);

      // Extract via Groq
      let extractionResult;
      try {
        extractionResult = await extractor.extract(cleanedNote, patientContext, note_type);
      } catch (err) {
        logger.error('Groq extraction failed', { err, patient_id });
        return reply.code(502).send({ error: 'AI extraction service unavailable. Please retry.' });
      }

      // Score actions
      const scoredActions = scoreAll(extractionResult.actions);

      // Upsert clinical document if encounter_id provided
      let documentId: string | null = null;
      if (encounter_id) {
        documentId = uuid();
        await query(
          `INSERT INTO clinical_documents (id, patient_id, encounter_id, type, raw_text, processed_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT DO NOTHING`,
          [documentId, patient_id, encounter_id, note_type, note_text]
        );
      }

      // Persist extracted actions
      const extractionId = uuid();
      for (const action of scoredActions) {
        await query(
          `INSERT INTO extracted_actions
             (id, document_id, patient_id, action_type, details, confidence, verbatim_source, urgency, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            uuid(),
            documentId,
            patient_id,
            action.type,
            JSON.stringify(action.details),
            action.confidence,
            action.verbatim_source,
            action.urgency,
            action.confidence < 0.7 ? 'pending' : 'pending', // all start pending; low-confidence flagged by score
          ]
        );
      }

      // Publish event
      const redis = getRedis();
      await redis.publish(
        CHANNELS.ACTION_EXTRACTED,
        JSON.stringify({ extractionId, patientId: patient_id, actionCount: scoredActions.length })
      );

      return reply.send({
        extraction_id: extractionId,
        patient_id,
        actions: scoredActions.map((a) => ({
          type: a.type,
          details: a.details,
          verbatim_source: a.verbatim_source,
          urgency: a.urgency,
          confidence: a.confidence,
        })),
        summary: extractionResult.summary,
      });
    }
  );
}
