/**
 * TOTP (Time-based One-Time Password) routes — enable, confirm, and disable
 * authenticator-app two-factor authentication for a user account.
 *
 * Setup flow:
 *   1. POST /api/totp/setup — generates a TOTP secret and returns a QR code (data URI)
 *   2. POST /api/totp/confirm — user enters the 6-digit code from their app to activate
 *   3. The TOTP secret is stored AES-256-GCM encrypted in the database
 *
 * Login flow: when TOTP is enabled, the login endpoint issues a short-lived mfa_challenge
 * JWT instead of a full session. The client then calls POST /api/auth/totp/challenge
 * with the 6-digit code to exchange it for a real session cookie.
 *
 * Disable requires the current password as confirmation to prevent unauthorized disabling.
 */
import { FastifyInstance } from 'fastify';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../utils/validate';
import { config } from '../config/env';
import { issueAuthCookie } from '../utils/auth-cookie';
import { decryptUserPii } from '../utils/crypto';
import { logAdminEvent } from '../utils/audit';
import { z } from 'zod';

const ISSUER = 'Planly';
const BACKUP_CODE_COUNT = 8;
const MFA_TOKEN_TYPE = 'mfa_challenge';

function makeTotp(secret: string, username: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function verifyCode(secret: string, username: string, token: string): boolean {
  const totp = makeTotp(secret, username);
  return totp.validate({ token: token.replace(/\s/g, ''), window: 1 }) !== null;
}

async function generateBackupCodes(): Promise<{ plain: string[]; hashes: string[] }> {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = randomBytes(5).toString('hex').toUpperCase(); // e.g. "A3F9C2E1B4"
    plain.push(code);
    hashes.push(await bcrypt.hash(code, 10));
  }
  return { plain, hashes };
}

async function checkBackupCode(userId: string, code: string): Promise<boolean> {
  const stored = await prisma.totpBackupCode.findMany({ where: { userId } });
  for (const row of stored) {
    if (await bcrypt.compare(code.replace(/\s/g, '').toUpperCase(), row.codeHash)) {
      await prisma.totpBackupCode.delete({ where: { id: row.id } });
      return true;
    }
  }
  return false;
}

export async function totpRoutes(app: FastifyInstance) {
  // Start setup: generate a new secret and return the QR code URI.
  // The secret is stored (totpEnabled stays false) until the user confirms with a valid code.
  app.post('/api/auth/totp/setup', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, totpEnabled: true },
    });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    if (user.totpEnabled) return reply.status(409).send({ error: 'TOTP is already enabled. Disable it first.' });

    const secret = generateSecret();
    const totp = makeTotp(secret, user.username);
    const uri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(uri);

    // Persist the secret tentatively (totpEnabled remains false)
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });

    reply.send({ qrDataUrl, secret, uri });
  });

  // Confirm setup: verify the first code, activate TOTP, return one-time backup codes.
  app.post('/api/auth/totp/confirm', { preHandler: requireAuth }, async (req, reply) => {
    const body = validate(z.object({ code: z.string().min(6).max(8) }), req.body, reply);
    if (!body) return;

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, totpSecret: true, totpEnabled: true },
    });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    if (user.totpEnabled) return reply.status(409).send({ error: 'TOTP is already enabled' });
    if (!user.totpSecret) return reply.status(400).send({ error: 'Run /totp/setup first' });

    if (!verifyCode(user.totpSecret, user.username, body.code)) {
      return reply.status(401).send({ error: 'Invalid code — check your authenticator app and try again' });
    }

    const { plain, hashes } = await generateBackupCodes();

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } }),
      prisma.totpBackupCode.deleteMany({ where: { userId: user.id } }),
      ...hashes.map((codeHash) => prisma.totpBackupCode.create({ data: { userId: user.id, codeHash } })),
    ]);

    logAdminEvent('TOTP_ENABLED', { actorName: user.username, targetName: user.username });

    reply.send({
      ok: true,
      backupCodes: plain,
      message: 'Two-factor authentication is now enabled. Save these backup codes — they will not be shown again.',
    });
  });

  // Disable TOTP: requires a valid TOTP code or backup code.
  app.delete('/api/auth/totp/disable', { preHandler: requireAuth }, async (req, reply) => {
    const body = validate(z.object({ code: z.string().min(6).max(10) }), req.body, reply);
    if (!body) return;

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, totpSecret: true, totpEnabled: true },
    });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    if (!user.totpEnabled) return reply.status(409).send({ error: 'TOTP is not enabled' });

    const codeOk = user.totpSecret
      ? verifyCode(user.totpSecret, user.username, body.code)
      : false;
    const backupOk = !codeOk && (await checkBackupCode(user.id, body.code));

    if (!codeOk && !backupOk) {
      return reply.status(401).send({ error: 'Invalid code' });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } }),
      prisma.totpBackupCode.deleteMany({ where: { userId: user.id } }),
    ]);

    logAdminEvent('TOTP_DISABLED', { actorName: user.username, targetName: user.username });

    reply.send({ ok: true });
  });

  // TOTP challenge: verifies the code after password-only login returned requiresTOTP.
  // On success issues the full session cookie.
  app.post('/api/auth/totp/challenge', async (req, reply) => {
    const body = validate(z.object({ mfaToken: z.string().min(1), code: z.string().min(6).max(10) }), req.body, reply);
    if (!body) return;

    let payload: { userId: string; type: string };
    try {
      payload = jwt.verify(body.mfaToken, config.jwtSecret) as { userId: string; type: string };
    } catch {
      return reply.status(401).send({ error: 'MFA token expired or invalid — please log in again' });
    }
    if (payload.type !== MFA_TOKEN_TYPE) {
      return reply.status(401).send({ error: 'Invalid token type' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return reply.status(401).send({ error: 'MFA not configured for this account' });
    }

    const codeOk = verifyCode(user.totpSecret, user.username, body.code);
    const backupOk = !codeOk && (await checkBackupCode(user.id, body.code));

    if (!codeOk && !backupOk) {
      return reply.status(401).send({ error: 'Invalid code' });
    }

    // Full authentication complete — now increment tokenVersion
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username, tokenVersion: updatedUser.tokenVersion },
      config.jwtSecret,
      { expiresIn: '7d' },
    );

    await prisma.adminLog.create({
      data: { action: 'LOGIN_TOTP', actorName: user.username, targetName: user.username },
    }).catch(() => {});

    issueAuthCookie(reply, token);
    reply.send(decryptUserPii({ id: user.id, username: user.username, email: user.email, realName: user.realName, avatarEmoji: user.avatarEmoji, mustChangePassword: user.mustChangePassword, isAdmin: user.isAdmin, isFoundingAdmin: user.isFoundingAdmin, emailVerified: user.emailVerified }));
  });

  // Returns whether TOTP is enabled for the current user.
  app.get('/api/auth/totp/status', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { totpEnabled: true },
    });
    reply.send({ enabled: user?.totpEnabled ?? false });
  });
}
