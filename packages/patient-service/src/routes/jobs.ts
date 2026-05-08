import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '@ehr/shared';

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/jobs/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = request.params as { jobId: string };

    const result = await query(
      `SELECT id, type, status, progress, error, created_at, completed_at
       FROM jobs WHERE id = $1`,
      [jobId]
    );

    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    const job = result.rows[0];
    return reply.send({
      job_id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      error: job.error ?? null,
      created_at: job.created_at,
      completed_at: job.completed_at ?? null,
    });
  });
}
