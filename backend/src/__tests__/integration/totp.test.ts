/**
 * Integration tests for TOTP two-factor authentication flow.
 * Set TEST_DATABASE_URL to run locally. Always provided in CI via .github/workflows/test.yml.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as OTPAuth from 'otpauth';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

function generateCode(secret: string, username: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'Planly',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate();
}

describe.skipIf(!HAS_DB)('TOTP flow', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const email = `totp_${suffix}@example.com`;
  const username = `totp_${suffix}`;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const user = await createTestUser({ email, username, password: 'pass1234' });
    userId = user.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: 'pass1234' },
    });
    const cookie = loginRes.headers['set-cookie']?.[0] ?? '';
    token = (cookie.split(';')[0] ?? '').replace('token=', '');
  });

  afterAll(async () => {
    await prisma.totpBackupCode.deleteMany({ where: { userId } });
    await prisma.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecret: null } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
    await prisma.$disconnect();
  });

  // Setup generates a provisional secret + QR; not yet active until confirmed
  it('POST /api/auth/totp/setup returns a secret and QR code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/setup',
      cookies: { token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.secret).toBeDefined();
    expect(body.qrDataUrl).toMatch(/^data:image/);
  });

  // Confirm with a live code activates TOTP and returns 8 one-time backup codes
  it('POST /api/auth/totp/confirm activates TOTP with a valid code', async () => {
    // Re-run setup to get a fresh secret
    const setupRes = await app.inject({ method: 'POST', url: '/api/auth/totp/setup', cookies: { token } });
    const { secret } = JSON.parse(setupRes.body);

    const code = generateCode(secret, username);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/confirm',
      cookies: { token },
      payload: { code },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.backupCodes)).toBe(true);
    expect(body.backupCodes).toHaveLength(8);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.totpEnabled).toBe(true);
  });

  // Calling setup again after TOTP is active returns 409; re-enrollment must go through disable first
  it('POST /api/auth/totp/confirm rejects after TOTP is already enabled', async () => {
    const setupRes = await app.inject({ method: 'POST', url: '/api/auth/totp/setup', cookies: { token } });
    expect(setupRes.statusCode).toBe(409);
  });

  // Disable requires the current TOTP code as proof of device possession
  it('DELETE /api/auth/totp/disable with a valid code disables TOTP', async () => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const code = generateCode(user!.totpSecret!, username);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/auth/totp/disable',
      cookies: { token },
      payload: { code },
    });
    expect(res.statusCode).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: userId } });
    expect(updated?.totpEnabled).toBe(false);
  });

  // Disabling when TOTP is already off is a conflict, not a silent no-op
  it('DELETE /api/auth/totp/disable returns 409 when TOTP is not enabled', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/auth/totp/disable',
      cookies: { token },
      payload: { code: '123456' },
    });
    expect(res.statusCode).toBe(409);
  });

  // Status endpoint lets the client know whether to show the TOTP prompt on login
  it('GET /api/auth/totp/status reports current TOTP state', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/totp/status', cookies: { token } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.enabled).toBe('boolean');
  });
});
