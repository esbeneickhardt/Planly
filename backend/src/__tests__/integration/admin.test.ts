/**
 * Integration tests for admin user management and server config gate.
 * Set TEST_DATABASE_URL to run locally. Always provided in CI via .github/workflows/test.yml.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Admin user management', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const adminEmail = `admin_${suffix}@example.com`;
  const targetEmail = `target_${suffix}@example.com`;
  let targetId: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const adminUser = await createTestUser({ email: adminEmail, username: `admin_${suffix}`, password: 'pass1234', isAdmin: true });
    await prisma.user.update({ where: { id: adminUser.id }, data: { isFoundingAdmin: true } });
    const target = await createTestUser({ email: targetEmail, username: `target_${suffix}`, password: 'pass1234' });
    targetId = target.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: adminEmail, password: 'pass1234' },
    });
    const cookie = loginRes.headers['set-cookie']?.[0] ?? '';
    adminToken = (cookie.split(';')[0] ?? '').replace('token=', '');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, targetEmail] } } });
    await app.close();
    await prisma.$disconnect();
  });

  // Admin can list all users; confirms the target user appears in the list
  it('GET /api/admin/users returns user list to admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { token: adminToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((u: { id: string }) => u.id === targetId)).toBe(true);
  });

  // Admin endpoints must not leak data to unauthenticated callers
  it('GET /api/admin/users returns 401 to unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  // Promotion sets isAdmin=true; verified directly in the DB, not just via the response
  it('PUT /api/admin/users/:id/promote promotes a user to admin', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${targetId}/promote`,
      cookies: { token: adminToken },
    });
    expect(res.statusCode).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    expect(user?.isAdmin).toBe(true);
  });

  // Demotion sets isAdmin=false; pre-set to true in DB to decouple from the promote test
  it('PUT /api/admin/users/:id/demote demotes a user from admin', async () => {
    // Ensure target is admin first
    await prisma.user.update({ where: { id: targetId }, data: { isAdmin: true } });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${targetId}/demote`,
      cookies: { token: adminToken },
    });
    expect(res.statusCode).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    expect(user?.isAdmin).toBe(false);
  });

  // Deletion returns 204 and the record is gone from the DB
  it('DELETE /api/admin/users/:id deletes a user', async () => {
    const del = await createTestUser({ email: `del_${suffix}@example.com`, username: `del_${suffix}` });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${del.id}`,
      cookies: { token: adminToken },
    });
    expect(res.statusCode).toBe(204);
    const user = await prisma.user.findUnique({ where: { id: del.id } });
    expect(user).toBeNull();
  });
});

describe.skipIf(!HAS_DB)('allowProjectCreation gate', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const adminEmail = `admin2_${suffix}@example.com`;
  const memberEmail = `member2_${suffix}@example.com`;
  let adminToken: string;
  let memberToken: string;
  let teamId: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const admin = await createTestUser({ email: adminEmail, username: `admin2_${suffix}`, password: 'pass1234', isAdmin: true });
    const member = await createTestUser({ email: memberEmail, username: `member2_${suffix}`, password: 'pass1234' });

    const team = await prisma.team.create({
      data: {
        name: `test-team-${suffix}`,
        members: { create: [{ userId: admin.id }, { userId: member.id }] },
      },
    });
    teamId = team.id;

    const adminLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: adminEmail, password: 'pass1234' } });
    adminToken = (adminLogin.headers['set-cookie']?.[0]?.split(';')[0] ?? '').replace('token=', '');

    const memberLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: memberEmail, password: 'pass1234' } });
    memberToken = (memberLogin.headers['set-cookie']?.[0]?.split(';')[0] ?? '').replace('token=', '');

    // Disable project creation for non-admins
    await prisma.serverConfig.upsert({
      where: { id: 'main' },
      update: { allowProjectCreation: false },
      create: { id: 'main', allowProjectCreation: false },
    });
  });

  afterAll(async () => {
    await prisma.serverConfig.upsert({ where: { id: 'main' }, update: { allowProjectCreation: true }, create: { id: 'main', allowProjectCreation: true } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail] } } });
    await app.close();
    await prisma.$disconnect();
  });

  // Gate is enforced: regular members get 403 while the setting is off
  it('non-admin cannot create a product when allowProjectCreation is false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/products',
      cookies: { token: memberToken },
      payload: { name: 'Blocked', teamId, deadline: '2030-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(403);
  });

  // Admins bypass the gate; product is created and immediately cleaned up
  it('admin can create a product even when allowProjectCreation is false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/products',
      cookies: { token: adminToken },
      payload: { name: 'Admin product', teamId, deadline: '2030-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(201);
    if (res.statusCode === 201) {
      const { id } = JSON.parse(res.body);
      await prisma.product.delete({ where: { id } });
    }
  });
});
