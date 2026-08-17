/**
 * Integration tests for the project-scoping of DM/group chat (routes/conversations.ts).
 * Non-admin conversations must be scoped to one project - every participant must be a member of
 * that project's team, and the same pair of users get an independent thread per project (not one
 * shared thread that bleeds context between projects). Admin-chat conversations stay unscoped
 * (isAdminChat: true), since server admins are allowed to contact anyone directly.
 * Set TEST_DATABASE_URL to run locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Conversation project scoping', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let aliceId: string;
  let bobId: string;
  let daveId: string;
  let carolId: string;
  let adminId: string;
  let teamAId: string;
  let productAId: string;
  let productBId: string;
  let aliceCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const alice = await createTestUser({
      username: `alice_${suffix}`,
      email: `alice_${suffix}@example.com`,
    });
    const bob = await createTestUser({
      username: `bob_${suffix}`,
      email: `bob_${suffix}@example.com`,
    });
    // A third team-A member, needed alongside bob for group tests (groups require 2+ other
    // participants besides the creator - a single extra participant is just a DM).
    const dave = await createTestUser({
      username: `dave_${suffix}`,
      email: `dave_${suffix}@example.com`,
    });
    // Carol belongs to no team at all - a clean "outside the project" user.
    const carol = await createTestUser({
      username: `carol_${suffix}`,
      email: `carol_${suffix}@example.com`,
    });
    // A genuine server admin (isAdmin: true) - the only identity allowed to actually use
    // isAdminChat: true (see the "isAdminChat can't be self-claimed" tests below).
    const admin = await createTestUser({
      username: `admin_${suffix}`,
      email: `admin_${suffix}@example.com`,
      isAdmin: true,
    });
    aliceId = alice.id;
    bobId = bob.id;
    daveId = dave.id;
    carolId = carol.id;
    adminId = admin.id;

    const teamA = await createTestTeam(aliceId, [bobId, daveId]);
    teamAId = teamA.id;
    const productA = await createTestProduct(aliceId, teamAId);
    productAId = productA.id;
    // A second project under the same team - used to prove the same pair of users get an
    // independent conversation per project rather than one shared/reused thread.
    const productB = await createTestProduct(aliceId, teamAId);
    productBId = productB.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: `alice_${suffix}@example.com`,
        password: 'test-password-123',
      },
    });
    aliceCookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: `admin_${suffix}@example.com`,
        password: 'test-password-123',
      },
    });
    adminCookie = adminLoginRes.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({
      where: {
        OR: [
          { productId: { in: [productAId, productBId] } },
          { isAdminChat: true, participants: { some: { userId: adminId } } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { id: { in: [productAId, productBId] } },
    });
    await prisma.team.deleteMany({ where: { id: teamAId } });
    await prisma.user.deleteMany({
      where: { id: { in: [aliceId, bobId, daveId, carolId, adminId] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /api/conversations without admin or productId is rejected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: { cookie: aliceCookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/conversations refuses a DM with someone outside the project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { cookie: aliceCookie },
      payload: { participantId: carolId, productId: productAId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/conversations creates a DM with a fellow project member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { cookie: aliceCookie },
      payload: { participantId: bobId, productId: productAId },
    });
    expect(res.statusCode).toBe(201);
    const { id } = JSON.parse(res.body);
    expect(id).toBeTruthy();

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/conversations?productId=${productAId}`,
      headers: { cookie: aliceCookie },
    });
    const { conversations } = JSON.parse(listRes.body);
    expect(conversations.some((c: { id: string }) => c.id === id)).toBe(true);
  });

  it('the same two users get an independent DM thread per project (not a shared/reused one)', async () => {
    const resA = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { cookie: aliceCookie },
      payload: { participantId: bobId, productId: productAId },
    });
    const resB = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { cookie: aliceCookie },
      payload: { participantId: bobId, productId: productBId },
    });
    const { id: idA } = JSON.parse(resA.body);
    const { id: idB } = JSON.parse(resB.body);
    expect(idA).not.toBe(idB);

    // Project A's conversation list must not surface project B's thread with the same person.
    const listA = await app.inject({
      method: 'GET',
      url: `/api/conversations?productId=${productAId}`,
      headers: { cookie: aliceCookie },
    });
    const { conversations: convsA } = JSON.parse(listA.body);
    expect(convsA.some((c: { id: string }) => c.id === idB)).toBe(false);
  });

  it('POST /api/conversations/group refuses a group with someone outside the project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversations/group',
      headers: { cookie: aliceCookie },
      payload: { participantIds: [bobId, carolId], productId: productAId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/conversations/group creates a group scoped to the project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversations/group',
      headers: { cookie: aliceCookie },
      payload: {
        participantIds: [bobId, daveId],
        name: 'Scoped group',
        productId: productAId,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/conversations/:id/participants refuses adding someone outside the project', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/conversations/group',
      headers: { cookie: aliceCookie },
      payload: {
        participantIds: [bobId, daveId],
        name: 'Add-test group',
        productId: productAId,
      },
    });
    const { id } = JSON.parse(createRes.body);

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/conversations/${id}/participants`,
      headers: { cookie: aliceCookie },
      payload: { userIds: [carolId] },
    });
    expect(addRes.statusCode).toBe(403);
  });

  it('a regular (non-admin) user cannot self-claim isAdminChat to reach someone outside the project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { cookie: aliceCookie },
      payload: { participantId: carolId, isAdminChat: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a regular (non-admin) user cannot self-claim isAdminChat when creating a group either', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversations/group',
      headers: { cookie: aliceCookie },
      payload: { participantIds: [carolId, daveId], isAdminChat: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a regular (non-admin) user cannot list with ?admin=true either', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversations?admin=true',
      headers: { cookie: aliceCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a genuine admin can use isAdminChat to reach anyone, no productId required', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { cookie: adminCookie },
      payload: { participantId: carolId, isAdminChat: true },
    });
    expect(res.statusCode).toBe(201);
  });
});
