/**
 * Admin server-config integration tests.
 *
 * Tests the GET/PUT /api/admin/server-config endpoints:
 *   - Admin can read and update all config fields
 *   - Non-admin gets 403
 *   - Unauthenticated gets 401
 *   - Updated values are persisted and returned on subsequent GET
 *
 * Also tests announcement controls (announcementsEnabled, announcementPostRole).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../helpers/app';
import { prisma, createTestUser, randomSuffix } from '../../helpers/db';
import { loginAs, cookieJar } from '../../helpers/auth';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Admin server-config', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const pw = 'admin-cfg-pass';

  let adminCookie: string;
  let userCookie: string;
  let adminId: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const admin = await createTestUser({
      email: `cfg_admin_${suffix}@t.com`,
      username: `cfg_admin_${suffix}`,
      password: pw,
      isAdmin: true,
    });
    const user = await createTestUser({
      email: `cfg_user_${suffix}@t.com`,
      username: `cfg_user_${suffix}`,
      password: pw,
    });
    adminId = admin.id;
    userId = user.id;

    adminCookie = await loginAs(app, `cfg_admin_${suffix}@t.com`, pw);
    userCookie = await loginAs(app, `cfg_user_${suffix}@t.com`, pw);

    // Ensure the ServerConfig singleton exists (created on first request)
    await app.inject({ method: 'GET', url: '/api/admin/server-config', cookies: cookieJar(adminCookie) });
  });

  afterAll(async () => {
    // Restore defaults so other test runs aren't affected
    await prisma.serverConfig.updateMany({
      data: { requireEmailVerification: false, requireWhitelist: false, allowProjectCreation: false },
    });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── Access control ─────────────────────────────────────────────────────────

  it('GET /api/admin/server-config returns 401 for unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/server-config' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/server-config returns 403 for regular user', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/server-config', cookies: cookieJar(userCookie) });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/admin/server-config returns config for admin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/server-config', cookies: cookieJar(adminCookie) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.requireEmailVerification).toBe('boolean');
    expect(typeof body.requireWhitelist).toBe('boolean');
  });

  it('PUT /api/admin/server-config returns 403 for regular user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/server-config',
      cookies: cookieJar(userCookie),
      payload: { requireWhitelist: true },
    });
    expect(res.statusCode).toBe(403);
  });

  // ── Config mutations ───────────────────────────────────────────────────────

  it('admin can enable requireWhitelist and value is persisted', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/server-config',
      cookies: cookieJar(adminCookie),
      payload: { requireWhitelist: true },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: '/api/admin/server-config', cookies: cookieJar(adminCookie) });
    expect(JSON.parse(get.body).requireWhitelist).toBe(true);
  });

  it('admin can disable requireWhitelist', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/server-config',
      cookies: cookieJar(adminCookie),
      payload: { requireWhitelist: false },
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body).requireWhitelist).toBe(false);
  });

  it('admin can toggle requireEmailVerification', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/server-config',
      cookies: cookieJar(adminCookie),
      payload: { requireEmailVerification: true },
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body).requireEmailVerification).toBe(true);

    // reset
    await app.inject({
      method: 'PUT',
      url: '/api/admin/server-config',
      cookies: cookieJar(adminCookie),
      payload: { requireEmailVerification: false },
    });
  });

  it('admin can enable announcementsEnabled', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/server-config',
      cookies: cookieJar(adminCookie),
      payload: { announcementsEnabled: true, announcementPostRole: 'admin' },
    });
    expect(put.statusCode).toBe(200);
    const body = JSON.parse(put.body);
    expect(body.announcementsEnabled).toBe(true);
    expect(body.announcementPostRole).toBe('admin');
  });

  it('admin can set allowProjectCreation', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/server-config',
      cookies: cookieJar(adminCookie),
      payload: { allowProjectCreation: true },
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body).allowProjectCreation).toBe(true);
  });

  // ── Admin user management (bonus) ──────────────────────────────────────────

  it('admin can list all users', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users', cookies: cookieJar(adminCookie) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((u) => u.id === userId)).toBe(true);
  });

  it('admin can grant admin rights to another user', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${userId}`,
      cookies: cookieJar(adminCookie),
      payload: { isAdmin: true },
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body).isAdmin).toBe(true);

    // revoke
    await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${userId}`,
      cookies: cookieJar(adminCookie),
      payload: { isAdmin: false },
    });
  });
});
