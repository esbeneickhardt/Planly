import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Column routes smoke', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let ownerId: string;
  let teamId: string;
  let productId: string;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const owner = await createTestUser({ username: `col_owner_${suffix}`, email: `col_owner_${suffix}@example.com` });
    ownerId = owner.id;
    const team = await createTestTeam(ownerId);
    teamId = team.id;
    const product = await createTestProduct(ownerId, teamId);
    productId = product.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: `col_owner_${suffix}@example.com`, password: 'test-password-123' },
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

  it('GET /api/products/:id/columns returns columns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/columns`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('POST /api/products/:id/columns creates a column', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/columns`,
      headers: { cookie },
      payload: { name: 'In Progress', color: '#3b82f6' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('In Progress');
  });

  it('PATCH /api/products/:id/columns/:columnId updates name', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/columns`,
      headers: { cookie },
      payload: { name: 'Old Name', color: '#10b981' },
    });
    const col = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}/columns/${col.id}`,
      headers: { cookie },
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe('New Name');
  });

  it('DELETE /api/products/:id/columns/:columnId removes column', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/columns`,
      headers: { cookie },
      payload: { name: 'To Remove', color: '#ef4444' },
    });
    const col = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/products/${productId}/columns/${col.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
  });
});
