import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query, getRedis } from '@ehr/shared';
import crypto from 'crypto';

export async function patientRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/patients — list all patients for a tenant
  app.get('/api/v1/patients', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenant_id } = request.query as { tenant_id?: string };

    const result = await query(
      `SELECT p.id, p.fhir_id, p.mrn, p.demographics, p.created_at, p.updated_at,
              t.slug as tenant_slug
       FROM patients p
       JOIN tenants t ON t.id = p.tenant_id
       WHERE ($1::text IS NULL OR t.slug = $1)
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [tenant_id ?? null]
    );

    return reply.send({ patients: result.rows, total: result.rowCount });
  });

  // GET /api/v1/patients/:id — get single patient with optional includes + Redis cache
  app.get('/api/v1/patients/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { include } = request.query as { include?: string };

    const includeFields = include?.split(',').map((s) => s.trim()) ?? [];
    const cacheKey = `ehr:patient:${id}:${crypto.createHash('md5').update(includeFields.sort().join(',')).digest('hex')}`;

    // Check cache
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return reply
        .header('X-Cache', 'HIT')
        .send(JSON.parse(cached));
    }

    // Patient
    const patientResult = await query(
      `SELECT p.id, p.fhir_id, p.mrn, p.demographics, p.created_at, p.updated_at
       FROM patients p WHERE p.id = $1`,
      [id]
    );
    if (patientResult.rowCount === 0) {
      return reply.code(404).send({ error: 'Patient not found' });
    }
    const patient = patientResult.rows[0];
    const response: Record<string, unknown> = { ...patient };

    // Optional includes
    if (includeFields.includes('encounters')) {
      const enc = await query(
        'SELECT * FROM encounters WHERE patient_id = $1 ORDER BY period_start DESC',
        [id]
      );
      response.encounters = enc.rows;
    }
    if (includeFields.includes('medications')) {
      const meds = await query(
        'SELECT * FROM medications WHERE patient_id = $1',
        [id]
      );
      response.medications = meds.rows;
    }
    if (includeFields.includes('conditions')) {
      const conds = await query(
        'SELECT * FROM conditions WHERE patient_id = $1',
        [id]
      );
      response.conditions = conds.rows;
    }

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(response), 'EX', 300);

    return reply.header('X-Cache', 'MISS').send(response);
  });
}
