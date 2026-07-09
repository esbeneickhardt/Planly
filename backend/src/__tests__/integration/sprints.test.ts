import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Sprint routes smoke', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let ownerId: string;
  let teamId: string;
  let productId: string;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const owner = await createTestUser({ username: `sprint_owner_${suffix}`, email: `sprint_owner_${suffix}@example.com` });
    ownerId = owner.id;
    const team = await createTestTeam(ownerId);
    teamId = team.id;
    const product = await createTestProduct(ownerId, teamId);
    productId = product.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: `sprint_owner_${suffix}@example.com`, password: 'test-password-123' },
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

  it('GET /api/products/:id/sprints returns empty array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/sprints`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('POST /api/products/:id/sprints creates a sprint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/sprints`,
      headers: { cookie },
      payload: {
        name: 'Sprint 1',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Sprint 1');
  });

  it('PATCH /api/products/:id/sprints/:sprintId updates name', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/sprints`,
      headers: { cookie },
      payload: {
        name: 'To Rename',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      },
    });
    const sprint = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}/sprints/${sprint.id}`,
      headers: { cookie },
      payload: { name: 'Renamed Sprint' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe('Renamed Sprint');
  });

  it('DELETE /api/products/:id/sprints/:sprintId removes sprint', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/sprints`,
      headers: { cookie },
      payload: {
        name: 'To Delete',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      },
    });
    const sprint = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/products/${productId}/sprints/${sprint.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
  });
});
