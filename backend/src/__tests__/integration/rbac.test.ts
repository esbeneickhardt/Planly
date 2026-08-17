/**
 * Integration tests for RBAC - verifies that access controls are enforced.
 * Requires a running PostgreSQL with Planly schema.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';

// Set TEST_DATABASE_URL to run locally. Always provided in CI via .github/workflows/test.yml.
const HAS_DB = !!process.env.TEST_DATABASE_URL;

async function loginAs(app: FastifyInstance, email: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { identifier: email, password },
  });
  const cookie = res.headers['set-cookie']?.[0] ?? '';
  return (cookie.split(';')[0] ?? '').replace('token=', '');
}

describe.skipIf(!HAS_DB)('RBAC integration', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const ownerEmail = `owner_${suffix}@example.com`;
  const memberEmail = `member_${suffix}@example.com`;
  let productId: string;
  let ownerToken: string;
  let memberToken: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const owner = await createTestUser({
      email: ownerEmail,
      username: `owner_${suffix}`,
      password: 'pass123',
    });
    const member = await createTestUser({
      email: memberEmail,
      username: `member_${suffix}`,
      password: 'pass123',
    });

    const team = await createTestTeam(owner.id, [member.id]);
    const product = await createTestProduct(owner.id, team.id);
    productId = product.id;

    ownerToken = await loginAs(app, ownerEmail, 'pass123');
    memberToken = await loginAs(app, memberEmail, 'pass123');
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, memberEmail] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  // Webhook creation is an owner-only action; happy path verifies the 201 response
  it('Owner can create a webhook', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/webhooks`,
      cookies: { token: ownerToken },
      payload: { url: 'https://example.com/hook', events: ['task.created'] },
    });
    expect(res.statusCode).toBe(201);
    // Cleanup
    const { id } = JSON.parse(res.body);
    await prisma.webhook.delete({ where: { id } });
  });

  // IVR-2: members can read/write tasks but must not manage integrations
  it('Regular member cannot create a webhook (IVR-2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/webhooks`,
      cookies: { token: memberToken },
      payload: { url: 'https://example.com/hook', events: ['task.created'] },
    });
    expect(res.statusCode).toBe(403);
  });

  // Export includes the full product snapshot; verifies the product ID is in the response
  it('Owner can export the project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/export`,
      cookies: { token: ownerToken },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).product.id).toBe(productId);
  });

  // IVR-3: export (full data dump) is restricted to owners/co-owners only
  it('Regular member cannot export the project (IVR-3)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/export`,
      cookies: { token: memberToken },
    });
    expect(res.statusCode).toBe(403);
  });

  // Auth check happens before membership check; unauthenticated gets 401, not 403
  it('Unauthenticated request is rejected with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productId}/export`,
    });
    expect(res.statusCode).toBe(401);
  });
});
