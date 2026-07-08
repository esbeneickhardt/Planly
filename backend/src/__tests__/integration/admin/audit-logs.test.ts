/**
 * Admin audit-log integration tests.
 *
 * Tests GET /api/admin/logs (paginated), filtering by action, and
 * GET /api/admin/logs/export (CSV and JSONL).
 *
 * Also verifies that admin actions (e.g. updating server-config) produce
 * log entries that are queryable via the logs endpoint.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../helpers/app';
import { prisma, createTestUser, randomSuffix } from '../../helpers/db';
import { loginAs, cookieJar } from '../../helpers/auth';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Admin audit logs', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const pw = 'audit-log-pass';

  let adminCookie: string;
  let userCookie: string;
  let adminId: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const admin = await createTestUser({ email: `log_admin_${suffix}@t.com`, username: `log_admin_${suffix}`, password: pw, isAdmin: true });
    const user  = await createTestUser({ email: `log_user_${suffix}@t.com`,  username: `log_user_${suffix}`,  password: pw });
    adminId = admin.id;
    userId  = user.id;

    adminCookie = await loginAs(app, `log_admin_${suffix}@t.com`, pw);
    userCookie  = await loginAs(app, `log_user_${suffix}@t.com`,  pw);

    // Trigger a known log entry by updating server config
    await app.inject({
      method: 'PUT', url: '/api/admin/server-config',
      cookies: cookieJar(adminCookie),
      payload: { allowProjectCreation: false },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── Access control ─────────────────────────────────────────────────────────

  it('GET /api/admin/logs returns 401 for unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/logs' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/logs returns 403 for regular user', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/logs', cookies: cookieJar(userCookie) });
    expect(res.statusCode).toBe(403);
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  it('returns paginated log entries for admin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/logs?limit=10', cookies: cookieJar(adminCookie) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { logs: unknown[]; nextCursor: string | null };
    expect(Array.isArray(body.logs)).toBe(true);
    expect('nextCursor' in body).toBe(true);
  });

  it('accepts a cursor for page 2', async () => {
    const page1 = await app.inject({ method: 'GET', url: '/api/admin/logs?limit=1', cookies: cookieJar(adminCookie) });
    const { logs, nextCursor } = JSON.parse(page1.body) as { logs: { id: string }[]; nextCursor: string | null };

    if (!nextCursor) return; // not enough log entries to page — skip gracefully

    const page2 = await app.inject({
      method: 'GET', url: `/api/admin/logs?limit=1&cursor=${nextCursor}`,
      cookies: cookieJar(adminCookie),
    });
    expect(page2.statusCode).toBe(200);
    const body2 = JSON.parse(page2.body) as { logs: { id: string }[] };
    // page 2 should be a different entry than page 1
    expect(body2.logs[0]?.id).not.toBe(logs[0]?.id);
  });

  // ── Action filter ──────────────────────────────────────────────────────────

  it('can filter logs by action=SERVER_CONFIG_UPDATED', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/logs?action=SERVER_CONFIG_UPDATED',
      cookies: cookieJar(adminCookie),
    });
    expect(res.statusCode).toBe(200);
    const { logs } = JSON.parse(res.body) as { logs: { action: string }[] };
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.action === 'SERVER_CONFIG_UPDATED')).toBe(true);
  });

  it('returns empty array for an action that never happened', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/logs?action=NONEXISTENT_ACTION_XYZ',
      cookies: cookieJar(adminCookie),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).logs).toHaveLength(0);
  });

  // ── Export ─────────────────────────────────────────────────────────────────

  it('GET /api/admin/logs/export returns CSV with header row', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/logs/export?format=csv',
      cookies: cookieJar(adminCookie),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.body).toMatch(/^id,action,actorId/);
  });

  it('GET /api/admin/logs/export returns JSONL format', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/logs/export?format=jsonl',
      cookies: cookieJar(adminCookie),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/ndjson|jsonl/);
  });

  it('export returns 403 for regular user', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/logs/export',
      cookies: cookieJar(userCookie),
    });
    expect(res.statusCode).toBe(403);
  });
});
