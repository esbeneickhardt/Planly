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
    const owner = await createTestUser({ username: `search_owner_${suffix}`, email: `search_owner_${suffix}@example.com` });
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

  it('GET /api/search requires a query parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

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

  it('GET /api/search rejects empty query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });
});
