/**
 * Integration tests for the global search endpoint.
 * GET /api/search?q=<term> returns matching tasks and messages across all products
 * the authenticated user is a member of. Results are scoped by membership so
 * outsiders cannot discover content via search.
 * Set TEST_DATABASE_URL to run locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Search routes smoke', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let ownerId: string;
  let teamId: string;
  let productId: string;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const owner = await createTestUser({
      username: `search_owner_${suffix}`,
      email: `search_owner_${suffix}@example.com`,
    });
    ownerId = owner.id;
    const team = await createTestTeam(ownerId);
    teamId = team.id;
    const product = await createTestProduct(ownerId, teamId);
    productId = product.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: `search_owner_${suffix}@example.com`, password: 'test-password-123' },
    });
    cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await app.close();
    await prisma.$disconnect();
  });

  // Missing ?q= should be rejected before any DB query runs
  it('GET /api/search requires a query parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  // Shape check: response always has tasks and messages keys even when empty
  it('GET /api/search?q=test returns results object', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=test',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('tasks');
    expect(body).toHaveProperty('messages');
  });

  // Empty string ?q= is semantically the same as missing; must not run an unbounded DB query
  it('GET /api/search rejects empty query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });
});
