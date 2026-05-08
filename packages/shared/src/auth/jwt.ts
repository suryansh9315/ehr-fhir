import jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';

export interface TokenPayload {
  sub: string;
  tenantId: string;
  scopes: string[];
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'local-dev-secret-change-in-prod';

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Fastify preHandler middleware — validates JWT and attaches decoded payload to request.
 * Skip auth in test environments when SKIP_AUTH=true.
 */
export async function jwtMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (process.env.SKIP_AUTH === 'true') {
    (request as FastifyRequest & { user: TokenPayload }).user = {
      sub: 'dev-user',
      tenantId: process.env.DEFAULT_TENANT_ID ?? 'epic-sandbox',
      scopes: ['patient:read', 'patient:write', 'notes:extract'],
    };
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    (request as FastifyRequest & { user: TokenPayload }).user = payload;
  } catch {
    reply.code(401).send({ error: 'Invalid or expired token' });
  }
}
