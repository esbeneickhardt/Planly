/**
 * Integration tests for password-reset token lifecycle.
 * Set TEST_DATABASE_URL to run locally. Always provided in CI via .github/workflows/test.yml.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'crypto';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('Password-reset token lifecycle', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const email = `pwreset_${suffix}@example.com`;
  let userId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const user = await createTestUser({
      email,
      username: `pwreset_${suffix}`,
      password: 'old-password',
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
    await prisma.$disconnect();
  });

  // Tokens not in the DB (typos, fabricated) must return an error, not 500
  it('POST /api/auth/reset-password rejects an invalid token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: {
        token: 'definitely-not-a-valid-token',
        password: 'NewPass123!',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid|expired/i);
  });

  // Tokens past their expiresAt must be rejected even if the hash matches
  it('POST /api/auth/reset-password rejects an expired token', async () => {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: raw, password: 'NewPass123!' },
    });
    expect(res.statusCode).toBe(400);
  });

  // Happy path: valid token changes the password and marks the token as used
  it('POST /api/auth/reset-password consumes a valid token', async () => {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: raw, password: 'NewPass123!' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    // Token is now marked as used
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    expect(record?.usedAt).not.toBeNull();
  });

  // Single-use tokens: replaying a consumed token must be rejected to prevent re-use attacks
  it('POST /api/auth/reset-password rejects a token that has already been used', async () => {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: new Date(), // already used
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: raw, password: 'AnotherPass456!' },
    });
    expect(res.statusCode).toBe(400);
  });

  // End-to-end: reset flow actually changes the stored hash - login works with the new password
  it('can log in with new password after reset', async () => {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: raw, password: 'FreshPass789!' },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: 'FreshPass789!' },
    });
    expect(loginRes.statusCode).toBe(200);
  });
});
