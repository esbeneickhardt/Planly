/**
 * Integration tests for auth flows.
 * Requires a running PostgreSQL with Planly schema.
 * Skip automatically when TEST_DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, randomSuffix } from '../helpers/db';

// Set TEST_DATABASE_URL to run locally. Always provided in CI via .github/workflows/test.yml.
const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Auth integration', () => {
  let app: FastifyInstance;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
    await prisma.$disconnect();
  });

  // Happy path: valid credentials issue a signed JWT cookie and return the user object
  it('POST /api/auth/login returns a cookie on valid credentials', async () => {
    const suffix = randomSuffix();
    const email = `login_${suffix}@example.com`;
    createdEmails.push(email);
    await createTestUser({ email, username: `loginuser_${suffix}`, password: 'correct-horse' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: 'correct-horse' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']?.[0] ?? '').toMatch(/token=/);
    const body = JSON.parse(res.body);
    expect(body.email).toBe(email);
  });

  // Wrong password must not leak whether the account exists — always 401
  it('POST /api/auth/login rejects wrong password with 401', async () => {
    const suffix = randomSuffix();
    const email = `wrongpw_${suffix}@example.com`;
    createdEmails.push(email);
    await createTestUser({ email, username: `wrongpw_${suffix}`, password: 'correct-horse' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
  });

  // Schema validation rejects the request before any DB lookup
  it('POST /api/auth/login rejects missing credentials with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: 'someone@example.com' },
    });
    expect(res.statusCode).toBe(400);
  });

  // Unauthenticated requests must be blocked even on read-only endpoints
  it('GET /api/auth/me returns 401 without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  // Session cookie from login must be accepted on subsequent requests
  it('GET /api/auth/me returns user data with a valid session', async () => {
    const suffix = randomSuffix();
    const email = `me_${suffix}@example.com`;
    createdEmails.push(email);
    await createTestUser({ email, username: `me_${suffix}`, password: 'pass1234' });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: 'pass1234' },
    });
    const cookie = loginRes.headers['set-cookie']?.[0] ?? '';
    const token = (cookie.split(';')[0] ?? '').replace('token=', '');

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token },
    });
    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).email).toBe(email);
  });

  // Changing password bumps tokenVersion so pre-change sessions are instantly revoked
  it('Session is invalidated after password change (tokenVersion increment)', async () => {
    const suffix = randomSuffix();
    const email = `tv_${suffix}@example.com`;
    createdEmails.push(email);
    await createTestUser({ email, username: `tv_${suffix}`, password: 'old-password' });

    // Login to get a cookie
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: 'old-password' },
    });
    const cookie = loginRes.headers['set-cookie']?.[0] ?? '';
    const token = (cookie.split(';')[0] ?? '').replace('token=', '');

    // Change password
    await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      cookies: { token },
      payload: { currentPassword: 'old-password', newPassword: 'new-password-456' },
    });

    // Old token should now be invalid
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token },
    });
    expect(meRes.statusCode).toBe(401);
  });
});
