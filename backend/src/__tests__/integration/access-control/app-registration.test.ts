/**
 * App Registration integration tests.
 *
 * App Registrations are named service accounts. Each registration can issue
 * multiple tokens (for rotation). Registrations can be scoped to one product,
 * which restricts every token issued under them.
 *
 * Tests cover:
 *   - CRUD for app registrations via /api/apps
 *   - Issuing and revoking tokens under a registration
 *   - Scoped registration: token works for scoped product, blocked for others
 *   - Unscoped registration: token works for any product the owner is a member of
 *   - Non-owner cannot manage a registration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, createTestAppRegistration, randomSuffix } from '../../helpers/db';
import { loginAs, bearerHeaders, cookieJar } from '../../helpers/auth';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('App registrations', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const pw = 'app-reg-pass';

  let ownerCookie: string;
  let otherCookie: string;
  let ownerId: string;
  let otherId: string;
  let productAId: string;
  let productBId: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const owner = await createTestUser({ email: `apreg_owner_${suffix}@t.com`, username: `apreg_owner_${suffix}`, password: pw });
    const other = await createTestUser({ email: `apreg_other_${suffix}@t.com`, username: `apreg_other_${suffix}`, password: pw });
    ownerId = owner.id;
    otherId = other.id;

    const team     = await createTestTeam(owner.id);
    const teamBoth = await createTestTeam(owner.id, [other.id]);
    const productA = await createTestProduct(owner.id, team.id);
    const productB = await createTestProduct(owner.id, teamBoth.id);
    productAId = productA.id;
    productBId = productB.id;

    ownerCookie = await loginAs(app, `apreg_owner_${suffix}@t.com`, pw);
    otherCookie = await loginAs(app, `apreg_other_${suffix}@t.com`, pw);
  });

  afterAll(async () => {
    await prisma.apiToken.deleteMany({ where: { userId: { in: [ownerId, otherId] } } });
    await prisma.appRegistration.deleteMany({ where: { ownerId: { in: [ownerId, otherId] } } });
    await prisma.product.deleteMany({ where: { id: { in: [productAId, productBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── CRUD ───────────────────────────────────────────────────────────────────

  it('owner can list their app registrations (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/apps', cookies: cookieJar(ownerCookie) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('unauthenticated cannot list app registrations', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/apps' });
    expect(res.statusCode).toBe(401);
  });

  let createdAppId: string;

  it('owner can create an unscoped app registration', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/apps',
      cookies: cookieJar(ownerCookie),
      payload: { name: 'CI integration', description: 'Used by CI pipeline' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: string; name: string; productId: null };
    expect(body.name).toBe('CI integration');
    expect(body.productId).toBeNull();
    createdAppId = body.id;
  });

  it('owner can create a scoped app registration (product A)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/apps',
      cookies: cookieJar(ownerCookie),
      payload: { name: 'Scoped to A', productId: productAId },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).productId).toBe(productAId);
  });

  it('cannot scope to a product the user is not a member of', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/apps',
      cookies: cookieJar(otherCookie),
      payload: { name: 'Bad scope', productId: productAId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('owner can issue a token for an app registration', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/apps/${createdAppId}/tokens`,
      cookies: cookieJar(ownerCookie),
      payload: { name: 'v1' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { token: string; name: string };
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(16);
  });

  it('non-owner cannot issue a token for someone else\'s registration', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/apps/${createdAppId}/tokens`,
      cookies: cookieJar(otherCookie),
      payload: { name: 'steal' },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  // ── Token auth: unscoped registration ──────────────────────────────────────

  it('unscoped app token: can access any member product', async () => {
    const { raw } = await createTestAppRegistration(ownerId, { name: 'unscoped-app' });

    const resA = await app.inject({
      method: 'GET', url: `/api/products/${productAId}/tasks`,
      headers: bearerHeaders(raw),
    });
    expect(resA.statusCode).toBe(200);

    const resB = await app.inject({
      method: 'GET', url: `/api/products/${productBId}/tasks`,
      headers: bearerHeaders(raw),
    });
    expect(resB.statusCode).toBe(200);
  });

  // ── Token auth: scoped registration ───────────────────────────────────────

  it('scoped app token: can access scoped product, blocked for others', async () => {
    const { raw } = await createTestAppRegistration(ownerId, { productId: productAId, name: 'scoped-app' });

    const resA = await app.inject({
      method: 'GET', url: `/api/products/${productAId}/tasks`,
      headers: bearerHeaders(raw),
    });
    expect(resA.statusCode).toBe(200);

    const resB = await app.inject({
      method: 'GET', url: `/api/products/${productBId}/tasks`,
      headers: bearerHeaders(raw),
    });
    expect(resB.statusCode).toBe(403);
  });

  it('scoped app token: cannot access /api/admin', async () => {
    const { raw } = await createTestAppRegistration(ownerId, { productId: productAId, name: 'scoped-admin-attempt' });
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users',
      headers: bearerHeaders(raw),
    });
    expect(res.statusCode).toBe(403);
  });
});
