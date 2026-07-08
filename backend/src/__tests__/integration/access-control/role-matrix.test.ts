/**
 * Role-matrix integration tests.
 *
 * Verifies that every meaningful combination of user role × endpoint returns
 * the correct HTTP status code:
 *
 *   owner        – created the product; canManage = true
 *   member       – in the team, default tab permissions (read/write all)
 *   outsider     – authenticated user with no membership in this product
 *   unauthenticated – no token/cookie at all
 *
 * Each row in MATRIX describes one endpoint and the expected status per role.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../../helpers/db';
import { loginAs, cookieJar } from '../../helpers/auth';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Role matrix — endpoint access control', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const pw = 'pass-role-matrix';

  let ownerToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let productId: string;
  let taskId: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const owner    = await createTestUser({ email: `rm_owner_${suffix}@t.com`,    username: `rm_owner_${suffix}`,    password: pw });
    const member   = await createTestUser({ email: `rm_member_${suffix}@t.com`,   username: `rm_member_${suffix}`,   password: pw });
    await createTestUser({ email: `rm_outside_${suffix}@t.com`,  username: `rm_outside_${suffix}`,  password: pw });

    const team    = await createTestTeam(owner.id, [member.id]);
    const product = await createTestProduct(owner.id, team.id);
    productId = product.id;

    // Create a task to use in per-task endpoint tests
    const task = await prisma.task.create({
      data: { name: 'matrix-task', productId, createdBy: owner.id, status: 'backlog', kanbanOrder: 0 },
    });
    taskId = task.id;

    ownerToken    = await loginAs(app, `rm_owner_${suffix}@t.com`,   pw);
    memberToken   = await loginAs(app, `rm_member_${suffix}@t.com`,  pw);
    outsiderToken = await loginAs(app, `rm_outside_${suffix}@t.com`, pw);
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { email: { in: [
      `rm_owner_${suffix}@t.com`,
      `rm_member_${suffix}@t.com`,
      `rm_outside_${suffix}@t.com`,
    ] } } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── Helper ─────────────────────────────────────────────────────────────────

  type Role = 'owner' | 'member' | 'outsider' | 'anon';

  function token(role: Role): string | undefined {
    if (role === 'owner')    return ownerToken;
    if (role === 'member')   return memberToken;
    if (role === 'outsider') return outsiderToken;
    return undefined;
  }

  async function req(method: string, url: string, role: Role, payload?: unknown) {
    const t = token(role);
    return await app.inject({
      method: method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
      url,
      cookies: t ? cookieJar(t) : undefined,
      payload: payload as Record<string, unknown> | undefined,
    });
  }

  // ── Matrix ──────────────────────────────────────────────────────────────────

  const MATRIX: Array<{
    label: string;
    method: string;
    url: () => string;
    payload?: unknown;
    owner: number;
    member: number;
    outsider: number;
    anon: number;
  }> = [
    {
      label: 'GET tasks list',
      method: 'GET', url: () => `/api/products/${productId}/tasks`,
      owner: 200, member: 200, outsider: 403, anon: 401,
    },
    {
      label: 'POST create task',
      method: 'POST', url: () => `/api/products/${productId}/tasks`,
      payload: { name: 'new task' },
      owner: 201, member: 201, outsider: 403, anon: 401,
    },
    {
      label: 'PATCH update task',
      method: 'PATCH', url: () => `/api/products/${productId}/tasks/${taskId}`,
      payload: { name: 'renamed' },
      owner: 200, member: 200, outsider: 403, anon: 401,
    },
    {
      label: 'DELETE task (owner only)',
      method: 'DELETE', url: () => `/api/products/${productId}/tasks/${taskId}`,
      owner: 204, member: 204, outsider: 403, anon: 401,
    },
    {
      label: 'POST create webhook (owner/co-owner only)',
      method: 'POST', url: () => `/api/products/${productId}/webhooks`,
      payload: { url: 'https://example.com/hook', events: ['task.created'] },
      owner: 201, member: 403, outsider: 403, anon: 401,
    },
    {
      label: 'GET export (owner/co-owner only)',
      method: 'GET', url: () => `/api/products/${productId}/export`,
      owner: 200, member: 403, outsider: 403, anon: 401,
    },
    {
      label: 'GET sprints (any member)',
      method: 'GET', url: () => `/api/products/${productId}/sprints`,
      owner: 200, member: 200, outsider: 403, anon: 401,
    },
    {
      label: 'GET columns (any member)',
      method: 'GET', url: () => `/api/products/${productId}/columns`,
      owner: 200, member: 200, outsider: 403, anon: 401,
    },
    {
      label: 'GET admin users (blocked for non-admin)',
      method: 'GET', url: () => '/api/admin/users',
      owner: 403, member: 403, outsider: 403, anon: 401,
    },
    {
      label: 'GET admin server-config (blocked for non-admin)',
      method: 'GET', url: () => '/api/admin/server-config',
      owner: 403, member: 403, outsider: 403, anon: 401,
    },
  ];

  for (const row of MATRIX) {
    for (const role of ['owner', 'member', 'outsider', 'anon'] as Role[]) {
      const expected = row[role];
      it(`${row.label} → ${role} expects ${expected}`, async () => {
        const res = await req(row.method, row.url(), role, row.payload);
        expect(res.statusCode).toBe(expected);
      });
    }
  }
});
