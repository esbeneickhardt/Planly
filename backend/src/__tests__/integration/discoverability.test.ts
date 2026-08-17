/**
 * Integration tests for project discoverability.
 *
 * Products default to `discoverable: true`. Only the product owner may flip that flag
 * (PATCH /api/products/:id), and GET /api/products/discover only surfaces products that
 * are discoverable AND that the caller is not already a member of.
 * Set TEST_DATABASE_URL to run locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';
import { loginAs, cookieJar } from '../helpers/auth';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Project discoverability', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const pw = 'discover-pass-123';

  let ownerId: string;
  let coOwnerId: string;
  let memberId: string;
  let outsiderId: string;
  let ownerCookie: string;
  let coOwnerCookie: string;
  let memberCookie: string;
  let outsiderCookie: string;
  let teamId: string;
  let productId: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const owner = await createTestUser({
      email: `disc_owner_${suffix}@t.com`,
      username: `disc_owner_${suffix}`,
      password: pw,
    });
    const coOwner = await createTestUser({
      email: `disc_coowner_${suffix}@t.com`,
      username: `disc_coowner_${suffix}`,
      password: pw,
    });
    const member = await createTestUser({
      email: `disc_member_${suffix}@t.com`,
      username: `disc_member_${suffix}`,
      password: pw,
    });
    const outsider = await createTestUser({
      email: `disc_outsider_${suffix}@t.com`,
      username: `disc_outsider_${suffix}`,
      password: pw,
    });
    ownerId = owner.id;
    coOwnerId = coOwner.id;
    memberId = member.id;
    outsiderId = outsider.id;

    const team = await createTestTeam(ownerId, [coOwnerId, memberId]);
    teamId = team.id;
    await prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId: coOwnerId } },
      data: { role: 'co_owner' },
    });

    const product = await createTestProduct(ownerId, teamId);
    productId = product.id;

    ownerCookie = await loginAs(app, `disc_owner_${suffix}@t.com`, pw);
    coOwnerCookie = await loginAs(app, `disc_coowner_${suffix}@t.com`, pw);
    memberCookie = await loginAs(app, `disc_member_${suffix}@t.com`, pw);
    outsiderCookie = await loginAs(app, `disc_outsider_${suffix}@t.com`, pw);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, coOwnerId, memberId, outsiderId] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it("defaults to discoverable: true and appears in an outsider's discover list", async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/products/discover',
      cookies: cookieJar(outsiderCookie),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { products: Array<{ id: string }> };
    expect(body.products.some((p) => p.id === productId)).toBe(true);
  });

  it('co-owner cannot change discoverable (owner-only field)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}`,
      cookies: cookieJar(coOwnerCookie),
      payload: { discoverable: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it('plain member cannot change discoverable (owner-only field)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}`,
      cookies: cookieJar(memberCookie),
      payload: { discoverable: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it('owner can set discoverable: false', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}`,
      cookies: cookieJar(ownerCookie),
      payload: { discoverable: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).discoverable).toBe(false);
  });

  it('no longer appears in the discover list once discoverable is false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/products/discover',
      cookies: cookieJar(outsiderCookie),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { products: Array<{ id: string }> };
    expect(body.products.some((p) => p.id === productId)).toBe(false);
  });

  it('owner can set discoverable back to true and it reappears in the discover list', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/products/${productId}`,
      cookies: cookieJar(ownerCookie),
      payload: { discoverable: true },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body).discoverable).toBe(true);

    const res = await app.inject({
      method: 'GET',
      url: '/api/products/discover',
      cookies: cookieJar(outsiderCookie),
    });
    const body = JSON.parse(res.body) as { products: Array<{ id: string }> };
    expect(body.products.some((p) => p.id === productId)).toBe(true);
  });
});
