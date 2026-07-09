import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Canvas snapshot routes smoke', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let ownerId: string;
  let teamId: string;
  let productId: string;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const owner = await createTestUser({ username: `snap_owner_${suffix}`, email: `snap_owner_${suffix}@example.com` });
    ownerId = owner.id;
    const team = await createTestTeam(ownerId);
    teamId = team.id;
    const product = await createTestProduct(ownerId, teamId);
    productId = product.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: `snap_owner_${suffix}@example.com`, password: 'test-password-123' },
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

  it('GET /api/products/:id/canvas-snapshots returns empty array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/canvas-snapshots`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('POST /api/products/:id/canvas-snapshots saves a snapshot', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/canvas-snapshots`,
      headers: { cookie },
      payload: { name: 'Snapshot v1', data: { nodes: [], edges: [] } },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Snapshot v1');
  });

  it('DELETE /api/products/:id/canvas-snapshots/:snapshotId removes snapshot', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/canvas-snapshots`,
      headers: { cookie },
      payload: { name: 'To Delete', data: {} },
    });
    const snap = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/products/${productId}/canvas-snapshots/${snap.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
  });
});
