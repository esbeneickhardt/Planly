/**
 * Integration tests for public profile visibility.
 *
 * `showProjectsOnProfile` (default true) controls whether GET /api/users/:id/profile
 * exposes another user's project list. It can only be changed on your own account via
 * PATCH /api/users/:id. Viewing your own profile always shows your real projects and
 * `projectsVisible: true`, regardless of the setting.
 * Set TEST_DATABASE_URL to run locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';
import { loginAs, cookieJar } from '../helpers/auth';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Profile visibility', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const pw = 'profile-vis-pass-123';

  let targetId: string;
  let viewerId: string;
  let targetCookie: string;
  let viewerCookie: string;
  let teamId: string;
  let productId: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const target = await createTestUser({
      email: `pv_target_${suffix}@t.com`,
      username: `pv_target_${suffix}`,
      password: pw,
    });
    const viewer = await createTestUser({
      email: `pv_viewer_${suffix}@t.com`,
      username: `pv_viewer_${suffix}`,
      password: pw,
    });
    targetId = target.id;
    viewerId = viewer.id;

    const team = await createTestTeam(targetId);
    teamId = team.id;
    const product = await createTestProduct(targetId, teamId);
    productId = product.id;

    targetCookie = await loginAs(app, `pv_target_${suffix}@t.com`, pw);
    viewerCookie = await loginAs(app, `pv_viewer_${suffix}@t.com`, pw);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({
      where: { id: { in: [targetId, viewerId] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it("defaults to visible: another user sees the target's real projects", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${targetId}/profile`,
      cookies: cookieJar(viewerCookie),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      projectsVisible: boolean;
      projects: Array<{ id: string }>;
    };
    expect(body.projectsVisible).toBe(true);
    expect(body.projects.some((p) => p.id === productId)).toBe(true);
  });

  it("a user cannot change another user's showProjectsOnProfile setting", async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${targetId}`,
      cookies: cookieJar(viewerCookie),
      payload: { showProjectsOnProfile: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a user can toggle their own showProjectsOnProfile setting', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${targetId}`,
      cookies: cookieJar(targetCookie),
      payload: { showProjectsOnProfile: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).showProjectsOnProfile).toBe(false);
  });

  it('once hidden, another user sees projectsVisible: false and an empty projects array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${targetId}/profile`,
      cookies: cookieJar(viewerCookie),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      projectsVisible: boolean;
      projects: unknown[];
    };
    expect(body.projectsVisible).toBe(false);
    expect(body.projects).toEqual([]);
  });

  it('viewing your own profile always shows projectsVisible: true and real projects, even when hidden from others', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${targetId}/profile`,
      cookies: cookieJar(targetCookie),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      projectsVisible: boolean;
      projects: Array<{ id: string }>;
    };
    expect(body.projectsVisible).toBe(true);
    expect(body.projects.some((p) => p.id === productId)).toBe(true);
  });

  it('restoring showProjectsOnProfile to true makes projects visible to others again', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/users/${targetId}`,
      cookies: cookieJar(targetCookie),
      payload: { showProjectsOnProfile: true },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body).showProjectsOnProfile).toBe(true);

    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${targetId}/profile`,
      cookies: cookieJar(viewerCookie),
    });
    const body = JSON.parse(res.body) as {
      projectsVisible: boolean;
      projects: Array<{ id: string }>;
    };
    expect(body.projectsVisible).toBe(true);
    expect(body.projects.some((p) => p.id === productId)).toBe(true);
  });
});
