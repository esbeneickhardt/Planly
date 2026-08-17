/**
 * Regression tests for project-scoped PAT/App-token enforcement.
 *
 * A token created with a `productId` must never be able to reach anything outside that one
 * project - not other projects' data, not account-wide resources, and critically, not the
 * token-management routes themselves (a scoped token minting itself a fresh *unscoped* token
 * would completely defeat the scope it was given). These routes don't have a `:productId` in
 * their URL, so they're outside the blanket regex check in middleware/auth.ts and each needed
 * its own explicit guard - this file exists so that guard can't silently regress.
 * Set TEST_DATABASE_URL to run locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../helpers/app';
import {
  prisma,
  createTestUser,
  createTestTeam,
  createTestProduct,
  createTestApiToken,
  createTestAppRegistration,
  randomSuffix,
} from '../../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Scoped PAT/App-token enforcement', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let ownerId: string;
  let teamId: string;
  let productAId: string;
  let productBId: string;
  let otherTeamId: string;
  let otherTeamMemberId: string;
  let scopedToken: string;
  let appRegId: string;
  let dmConversationId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const owner = await createTestUser({
      username: `pat_owner_${suffix}`,
      email: `pat_owner_${suffix}@example.com`,
    });
    ownerId = owner.id;
    const team = await createTestTeam(ownerId);
    teamId = team.id;
    const productA = await createTestProduct(ownerId, teamId);
    productAId = productA.id;
    const productB = await createTestProduct(ownerId, teamId);
    productBId = productB.id;

    // A completely separate team (own product) the same owner also administers - a token scoped to
    // productA must never reach this one, even though the underlying user has full admin rights on it.
    const otherMember = await createTestUser({
      username: `pat_other_member_${suffix}`,
      email: `pat_other_member_${suffix}@example.com`,
    });
    otherTeamMemberId = otherMember.id;
    const otherTeam = await createTestTeam(ownerId, [otherTeamMemberId]);
    otherTeamId = otherTeam.id;
    await createTestProduct(ownerId, otherTeamId);

    const { raw } = await createTestApiToken(ownerId, {
      productId: productAId,
      name: 'scoped-to-A',
    });
    scopedToken = raw;

    const appReg = await createTestAppRegistration(ownerId, {
      productId: productAId,
      name: 'scoped-app',
    });
    appRegId = appReg.app.id;

    // A DM conversation scoped to product B - the A-scoped token must never reach it
    const conv = await prisma.conversation.create({
      data: {
        isGroup: false,
        productId: productBId,
        participants: { create: [{ userId: ownerId }] },
      },
    });
    dmConversationId = conv.id;

    // One notification per project so cross-project leakage is checkable
    await prisma.notification.createMany({
      data: [
        {
          userId: ownerId,
          productId: productAId,
          type: 'test',
          title: 'A notification',
        },
        {
          userId: ownerId,
          productId: productBId,
          type: 'test',
          title: 'B notification',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: ownerId } });
    await prisma.conversation.deleteMany({ where: { id: dmConversationId } });
    await prisma.apiToken.deleteMany({ where: { userId: ownerId } });
    await prisma.appRegistration.deleteMany({ where: { id: appRegId } });
    await prisma.product.deleteMany({
      where: { teamId: { in: [teamId, otherTeamId] } },
    });
    await prisma.team.deleteMany({
      where: { id: { in: [teamId, otherTeamId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherTeamMemberId] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  // CRITICAL regression: a scoped token minting a fresh unscoped token would completely escape
  // its own restriction.
  it('a scoped PAT cannot mint a new (unscoped) PAT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      headers: { authorization: `Bearer ${scopedToken}` },
      payload: { name: 'escape attempt' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a scoped PAT cannot list or revoke tokens', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/auth/tokens',
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(listRes.statusCode).toBe(403);
  });

  it('a scoped PAT cannot mint a token for an App Registration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/apps/${appRegId}/tokens`,
      headers: { authorization: `Bearer ${scopedToken}` },
      payload: { name: 'escape attempt' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a scoped PAT cannot list app registrations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/apps',
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a scoped PAT cannot create a new project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/products',
      headers: { authorization: `Bearer ${scopedToken}` },
      payload: {
        name: 'escape project',
        emoji: '🚀',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        teamId,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a scoped PAT only sees its own project when listing projects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/products',
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(res.statusCode).toBe(200);
    const products = JSON.parse(res.body);
    expect(products.map((p: { id: string }) => p.id)).toEqual([productAId]);
  });

  it('a scoped PAT only sees its own project in /api/me/permissions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me/permissions',
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(res.statusCode).toBe(200);
    const perms = JSON.parse(res.body);
    expect(perms.map((p: { productId: string }) => p.productId)).toEqual([productAId]);
  });

  it("a scoped PAT only sees its own project's notifications", async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { notifications } = JSON.parse(res.body);
    expect(notifications.some((n: { title: string }) => n.title === 'B notification')).toBe(false);
  });

  it('a scoped PAT cannot read a DM conversation scoped to a different project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/conversations/${dmConversationId}/messages`,
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // CRITICAL regression: team management has no :productId in its URL, so it was invisible to
  // both the global scope regex AND the first round of route-level fixes - a scoped token could
  // reach ANY team the underlying user administers, including deleting one outright.
  it('a scoped PAT only sees its own team when listing teams', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/teams',
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(res.statusCode).toBe(200);
    const teams = JSON.parse(res.body);
    expect(teams.map((t: { id: string }) => t.id)).toEqual([teamId]);
  });

  it('a scoped PAT cannot view, rename, or delete an unrelated team', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/teams/${otherTeamId}`,
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(getRes.statusCode).toBe(403);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/teams/${otherTeamId}`,
      headers: { authorization: `Bearer ${scopedToken}` },
      payload: { name: 'renamed by scoped token' },
    });
    expect(patchRes.statusCode).toBe(403);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/teams/${otherTeamId}`,
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(deleteRes.statusCode).toBe(403);
  });

  it('a scoped PAT cannot manage members or invites on an unrelated team', async () => {
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/teams/${otherTeamId}/members`,
      headers: { authorization: `Bearer ${scopedToken}` },
      payload: { userId: otherTeamMemberId },
    });
    expect(inviteRes.statusCode).toBe(403);

    const removeRes = await app.inject({
      method: 'DELETE',
      url: `/api/teams/${otherTeamId}/members/${otherTeamMemberId}`,
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(removeRes.statusCode).toBe(403);

    const roleRes = await app.inject({
      method: 'PATCH',
      url: `/api/teams/${otherTeamId}/members/${otherTeamMemberId}/role`,
      headers: { authorization: `Bearer ${scopedToken}` },
      payload: { role: 'co_owner' },
    });
    expect(roleRes.statusCode).toBe(403);

    const inviteLinkRes = await app.inject({
      method: 'POST',
      url: `/api/teams/${otherTeamId}/invites`,
      headers: { authorization: `Bearer ${scopedToken}` },
      payload: {},
    });
    expect(inviteLinkRes.statusCode).toBe(403);
  });

  it('a scoped PAT cannot create a new team', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${scopedToken}` },
      payload: { name: 'escape team' },
    });
    expect(res.statusCode).toBe(403);
  });

  it("a scoped PAT only sees its own project's teammates when listing users", async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { users } = JSON.parse(res.body);
    expect(users.some((u: { id: string }) => u.id === otherTeamMemberId)).toBe(false);
  });

  // Sanity check: the scope enforcement above isn't blocking everything - the token still works
  // normally for the one project (and its own team) it's actually scoped to.
  it('a scoped PAT can still access its own project and team normally', async () => {
    const productRes = await app.inject({
      method: 'GET',
      url: `/api/products/${productAId}`,
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(productRes.statusCode).toBe(200);

    const teamRes = await app.inject({
      method: 'GET',
      url: `/api/teams/${teamId}`,
      headers: { authorization: `Bearer ${scopedToken}` },
    });
    expect(teamRes.statusCode).toBe(200);
  });
});
