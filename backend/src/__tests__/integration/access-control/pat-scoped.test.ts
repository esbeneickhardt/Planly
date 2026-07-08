/**
 * PAT (Personal Access Token) scoping tests.
 *
 * A PAT can optionally be scoped to a single product. When scoped:
 *   - Requests to that product succeed (if the user is a member)
 *   - Requests to any other product return 403
 *   - Requests to /api/admin return 403
 *
 * An unscoped PAT behaves like a normal session: it can access any product
 * the user is a member of, including admin endpoints when isAdmin is true.
 *
 * An expired PAT must be rejected with 401.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, createTestApiToken, randomSuffix } from '../../helpers/db';
import { loginAs, bearerHeaders, cookieJar } from '../../helpers/auth';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('PAT scoping', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const pw = 'pat-scope-pass';

  let userId: string;
  let productAId: string;
  let productBId: string;
  let scopedToken: string;      // scoped to product A
  let unscopedToken: string;    // no product scope
  let expiredToken: string;     // expired PAT

  beforeAll(async () => {
    app = await buildTestApp();

    const user = await createTestUser({ email: `pat_user_${suffix}@t.com`, username: `pat_user_${suffix}`, password: pw });
    userId = user.id;

    const team = await createTestTeam(user.id);
    const productA = await createTestProduct(user.id, team.id);
    const productB = await createTestProduct(user.id, team.id);
    productAId = productA.id;
    productBId = productB.id;

    const scoped   = await createTestApiToken(userId, { productId: productAId, name: 'scoped-to-A' });
    const unscoped = await createTestApiToken(userId, { name: 'unscoped' });
    const expired  = await createTestApiToken(userId, { name: 'expired', expiresAt: new Date(Date.now() - 1000) });

    scopedToken   = scoped.raw;
    unscopedToken = unscoped.raw;
    expiredToken  = expired.raw;
  });

  afterAll(async () => {
    await prisma.apiToken.deleteMany({ where: { userId } });
    await prisma.product.deleteMany({ where: { id: { in: [productAId, productBId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── Scoped PAT ─────────────────────────────────────────────────────────────

  it('scoped PAT: can GET tasks for the scoped product', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productAId}/tasks`,
      headers: bearerHeaders(scopedToken),
    });
    expect(res.statusCode).toBe(200);
  });

  it('scoped PAT: cannot GET tasks for a different product (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productBId}/tasks`,
      headers: bearerHeaders(scopedToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('scoped PAT: cannot access /api/admin (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: bearerHeaders(scopedToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('scoped PAT: can POST create task for the scoped product', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/products/${productAId}/tasks`,
      headers: bearerHeaders(scopedToken),
      payload: { name: 'task via scoped PAT' },
    });
    expect(res.statusCode).toBe(201);
    // cleanup
    const { id } = JSON.parse(res.body) as { id: string };
    await prisma.task.delete({ where: { id } });
  });

  // ── Unscoped PAT ───────────────────────────────────────────────────────────

  it('unscoped PAT: can GET tasks for product A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productAId}/tasks`,
      headers: bearerHeaders(unscopedToken),
    });
    expect(res.statusCode).toBe(200);
  });

  it('unscoped PAT: can GET tasks for product B', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productBId}/tasks`,
      headers: bearerHeaders(unscopedToken),
    });
    expect(res.statusCode).toBe(200);
  });

  it('unscoped PAT: blocked from admin (user is not admin)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: bearerHeaders(unscopedToken),
    });
    expect(res.statusCode).toBe(403);
  });

  // ── Expired PAT ────────────────────────────────────────────────────────────

  it('expired PAT is rejected with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productAId}/tasks`,
      headers: bearerHeaders(expiredToken),
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Garbage token ──────────────────────────────────────────────────────────

  it('completely invalid Bearer token is rejected with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productAId}/tasks`,
      headers: bearerHeaders('not-a-real-token-abc123'),
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Cookie still works alongside tokens ────────────────────────────────────

  it('cookie auth still works for the same user', async () => {
    const cookie = await loginAs(app, `pat_user_${suffix}@t.com`, pw);
    const res = await app.inject({
      method: 'GET',
      url: `/api/products/${productAId}/tasks`,
      cookies: cookieJar(cookie),
    });
    expect(res.statusCode).toBe(200);
  });
});
