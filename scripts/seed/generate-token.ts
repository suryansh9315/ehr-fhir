/**
 * Generates a signed JWT for local development.
 * Usage: npx tsx scripts/seed/generate-token.ts
 *
 * The token can be used as:
 *   Authorization: Bearer <printed token>
 */
import 'dotenv/config';
import { signToken } from '../../packages/shared/src/auth/jwt';

const token = signToken({
  sub: 'dev-user',
  tenantId: process.env.DEFAULT_TENANT_ID ?? 'epic-sandbox',
  scopes: ['patient:read', 'patient:write', 'notes:extract'],
});

console.log('\n=== Dev JWT Token ===');
console.log(token);
console.log('\nUsage:');
console.log('  Authorization: Bearer ' + token);
console.log('\nExpires: 24h\n');
