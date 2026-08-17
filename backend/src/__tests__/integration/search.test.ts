/**
 * Integration tests for the global search endpoint.
 * GET /api/search?q=<term> returns matching tasks and messages across all products
 * the authenticated user is a member of. Results are scoped by membership so
 * outsiders cannot discover content via search.
 * Set TEST_DATABASE_URL to run locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Search routes smoke', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let teamId: string;
  let productId: string;
  let cookie: string;
  let outsiderCookie: string;
  let dmConversationId: string;
  let groupConversationId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const owner = await createTestUser({
      username: `search_owner_${suffix}`,
      email: `search_owner_${suffix}@example.com`,
    });
    ownerId = owner.id;
    const member = await createTestUser({
      username: `search_member_${suffix}`,
      email: `search_member_${suffix}@example.com`,
    });
    memberId = member.id;
    // On the same team/product as owner+member, but never added as a participant to either
    // conversation below - used to verify DM/group search results stay private to participants
    // even though this user can otherwise see (and search) the project's tasks/general chat.
    const outsider = await createTestUser({
      username: `search_outsider_${suffix}`,
      email: `search_outsider_${suffix}@example.com`,
    });
    outsiderId = outsider.id;
    const team = await createTestTeam(ownerId, [memberId, outsiderId]);
    teamId = team.id;
    const product = await createTestProduct(ownerId, teamId);
    productId = product.id;

    const dmConv = await prisma.conversation.create({
      data: {
        isGroup: false,
        productId,
        participants: { create: [{ userId: ownerId }, { userId: memberId }] },
        messages: {
          create: [{ authorId: memberId, content: 'Winston is so cute' }],
        },
      },
    });
    dmConversationId = dmConv.id;

    const groupConv = await prisma.conversation.create({
      data: {
        isGroup: true,
        name: 'Cat parents',
        productId,
        participants: { create: [{ userId: ownerId }, { userId: memberId }] },
        messages: {
          create: [{ authorId: ownerId, content: 'Winston needs a vet appointment' }],
        },
      },
    });
    groupConversationId = groupConv.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: `search_owner_${suffix}@example.com`,
        password: 'test-password-123',
      },
    });
    cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const outsiderLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: `search_outsider_${suffix}@example.com`,
        password: 'test-password-123',
      },
    });
    outsiderCookie = outsiderLoginRes.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({
      where: { id: { in: [dmConversationId, groupConversationId] } },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId, outsiderId] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  // Missing ?q= should be rejected before any DB query runs
  it('GET /api/search requires a query parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  // Shape check: response always has tasks and messages keys even when empty
  it('GET /api/search?q=test returns results object', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=test',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('tasks');
    expect(body).toHaveProperty('messages');
  });

  // Empty string ?q= is semantically the same as missing; must not run an unbounded DB query
  it('GET /api/search rejects empty query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  // Regression test: DM messages live in a separate table (DirectMessage/Conversation) from
  // project chat (Message) - search must query both, not just the latter.
  it('GET /api/search finds a DM message a participant sent', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=Winston',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const dmResult = body.messages.find(
      (m: { conversation?: { id: string } }) => m.conversation?.id === dmConversationId,
    );
    expect(dmResult).toBeTruthy();
    expect(dmResult.content).toBe('Winston is so cute');
    expect(dmResult.conversation.isGroup).toBe(false);
    expect(dmResult.conversation.other.id).toBe(memberId);
  });

  it('GET /api/search finds a group message and reports it as a group', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=Winston',
      headers: { cookie },
    });
    const body = JSON.parse(res.body);
    const groupResult = body.messages.find(
      (m: { conversation?: { id: string } }) => m.conversation?.id === groupConversationId,
    );
    expect(groupResult).toBeTruthy();
    expect(groupResult.conversation.isGroup).toBe(true);
    expect(groupResult.conversation.other).toBeNull();
    expect(groupResult.conversation.participants.some((p: { id: string }) => p.id === memberId)).toBe(true);
  });

  // Critical scoping check: a project member who isn't a participant in a given DM/group must not
  // see its content via search, even though they can see (and search) the project's own tasks/chat.
  it('GET /api/search does not leak DM/group content to a non-participant project member', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=Winston',
      headers: { cookie: outsiderCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const leaked = body.messages.some(
      (m: { conversation?: { id: string } }) =>
        m.conversation?.id === dmConversationId || m.conversation?.id === groupConversationId,
    );
    expect(leaked).toBe(false);
  });
});
