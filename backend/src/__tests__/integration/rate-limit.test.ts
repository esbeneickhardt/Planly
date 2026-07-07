/**
 * Integration test for rate limiting — verifies that repeated requests beyond the
 * configured threshold receive 429 Too Many Requests.
 *
 * Uses a test app with a very low limit (3 requests/minute) so we don't need to
 * hammer the endpoint hundreds of times.
 *
 * Set TEST_DATABASE_URL to run locally. Always provided in CI via .github/workflows/test.yml.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp({ rateLimitMax: 3 });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('returns 429 after exceeding the request threshold', async () => {
    const url = '/api/auth/me';

    // First 3 requests should pass (all 401 — unauthenticated, but not rate-limited)
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    }

    // The 4th request should hit the rate limit
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(429);
  });
});
