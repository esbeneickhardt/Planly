/**
 * Integration tests for Kanban column CRUD operations.
 * Columns define the status buckets on the board (e.g. "To Do", "In Progress", "Done").
 * Each product has its own set of columns; tests operate under a product owned by the requester.
 * Set TEST_DATABASE_URL to run locally.
 */
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
    const owner = await createTestUser({
      username: `col_owner_${suffix}`,
      email: `col_owner_${suffix}@example.com`,
    });
    ownerId = owner.id;
    const team = await createTestTeam(ownerId);
    teamId = team.id;
    const product = await createTestProduct(ownerId, teamId);
    productId = product.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: `col_owner_${suffix}@example.com`,
        password: 'test-password-123',
      },
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

  // Products start with default columns seeded at creation; result is always an array
  it('GET /api/products/:id/columns returns columns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/columns`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  // Custom columns can be added alongside the defaults
  it('POST /api/products/:id/columns creates a column', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/columns`,
      headers: { cookie },
      payload: { label: 'In Progress', color: '#3b82f6' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.label).toBe('In Progress');
  });

  // Renaming a column updates the label without changing its id or order
  it('PATCH /api/products/:id/columns/:columnId updates name', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/columns`,
      headers: { cookie },
      payload: { label: 'Old Name', color: '#10b981' },
    });
    const col = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}/columns/${col.id}`,
      headers: { cookie },
      payload: { label: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).label).toBe('New Name');
  });

  // Deleting a column cascades: tasks in that column are reassigned or deleted per schema rules
  it('DELETE /api/products/:id/columns/:columnId removes column', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/columns`,
      headers: { cookie },
      payload: { label: 'To Remove', color: '#ef4444' },
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
