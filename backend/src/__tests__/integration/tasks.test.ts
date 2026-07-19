/**
 * Integration tests for task CRUD operations.
 * Requires a running PostgreSQL with Planly schema.
 * Set TEST_DATABASE_URL to run locally. Always provided in CI via .github/workflows/test.yml.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Task CRUD integration', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const ownerEmail = `task_owner_${suffix}@example.com`;
  let ownerId: string;
  let teamId: string;
  let productId: string;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const owner = await createTestUser({ email: ownerEmail, username: `task_owner_${suffix}`, password: 'pass1234' });
    ownerId = owner.id;
    const team = await createTestTeam(ownerId);
    teamId = team.id;
    const product = await createTestProduct(ownerId, teamId);
    productId = product.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: ownerEmail, password: 'pass1234' },
    });
    const cookie = loginRes.headers['set-cookie']?.[0] ?? '';
    ownerToken = (cookie.split(';')[0] ?? '').replace('token=', '');
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({ where: { email: ownerEmail } });
    await app.close();
    await prisma.$disconnect();
  });

  // Happy path: task is created with the supplied name and returns 201
  it('POST /api/products/:id/tasks creates a task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/tasks`,
      cookies: { token: ownerToken },
      payload: { name: 'Test task', status: 'todo' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Test task');
    expect(body.status).toBe('todo');
  });

  // Status is independently patchable; response immediately reflects the new value
  it('PATCH /api/products/:id/tasks/:taskId updates task status', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/tasks`,
      cookies: { token: ownerToken },
      payload: { name: 'Status task' },
    });
    const task = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}/tasks/${task.id}`,
      cookies: { token: ownerToken },
      payload: { status: 'done' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('done');
  });

  // ownerId can be set independently of other fields in the same PATCH call
  it('PATCH /api/products/:id/tasks/:taskId assigns an owner', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/tasks`,
      cookies: { token: ownerToken },
      payload: { name: 'Owner task' },
    });
    const task = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}/tasks/${task.id}`,
      cookies: { token: ownerToken },
      payload: { ownerId },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ownerId).toBe(ownerId);
  });

  // Deadline is stored as an ISO timestamp; response confirms the field is set
  it('PATCH /api/products/:id/tasks/:taskId sets a deadline', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/tasks`,
      cookies: { token: ownerToken },
      payload: { name: 'Deadline task' },
    });
    const task = JSON.parse(createRes.body);

    const deadline = '2030-12-31T00:00:00.000Z';
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}/tasks/${task.id}`,
      cookies: { token: ownerToken },
      payload: { deadline },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deadline).toBeDefined();
  });

  // Deletion returns 204 and subsequent GET on the same ID returns 404
  it('DELETE /api/products/:id/tasks/:taskId removes a task', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/tasks`,
      cookies: { token: ownerToken },
      payload: { name: 'Delete me' },
    });
    const task = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/products/${productId}/tasks/${task.id}`,
      cookies: { token: ownerToken },
    });
    expect(res.statusCode).toBe(204);

    // Confirm it's gone
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/tasks/${task.id}`,
      cookies: { token: ownerToken },
    });
    expect(getRes.statusCode).toBe(404);
  });

  // Even read-only endpoints require a valid session
  it('GET /api/products/:id/tasks returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/tasks`,
    });
    expect(res.statusCode).toBe(401);
  });
});
