import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { getServerConfig } from '../utils/server-config';
import { validate } from '../utils/validate';
import { loginSchema } from '../schemas/auth';
import { sendSecurityAlert } from '../utils/security-alert';
import { decryptUserPii } from '../utils/crypto';

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = validate(loginSchema, req.body, reply);
    if (!body) return;
    const { identifier, password } = body;

    const trimmed = identifier.trim();
    const normalized = trimmed.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { username: { equals: trimmed, mode: 'insensitive' } }] },
    });
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' });
    if (!user.passwordHash) return reply.status(401).send({ error: 'Invalid credentials' });

    // Check lockout
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      const remaining = Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60000);
      return reply.status(429).send({ error: `Account temporarily locked. Try again in ${remaining} minute${remaining === 1 ? '' : 's'}.` });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= LOGIN_MAX_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          ...(shouldLock ? { loginLockedUntil: new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000) } : {}),
        },
      });
      await prisma.adminLog.create({ data: { action: 'LOGIN_FAILED', targetName: user.username, metadata: { attempts } } }).catch((err) => { console.warn('[auth] Failed to write LOGIN_FAILED audit log:', (err as Error).message); });
      if (shouldLock) {
        await prisma.adminLog.create({ data: { action: 'LOGIN_LOCKED', targetName: user.username } }).catch((err) => { console.warn('[auth] Failed to write LOGIN_LOCKED audit log:', (err as Error).message); });
        sendSecurityAlert('LOGIN_LOCKED', `Account "${user.username}" locked after ${LOGIN_MAX_ATTEMPTS} failed attempts`);
        return reply.status(429).send({ error: `Too many failed attempts. Account locked for ${LOGIN_LOCK_MINUTES} minutes.` });
      }
      const remaining = LOGIN_MAX_ATTEMPTS - attempts;
      return reply.status(401).send({ error: `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.` });
    }

    const serverConfig = await getServerConfig();
    if (!user.emailVerified && serverConfig.requireEmailVerification) {
      return reply.status(403).send({ error: 'Please verify your email address before signing in. Check your inbox for a verification link.' });
    }

    // If TOTP is enabled, issue a short-lived challenge token instead of a session cookie.
    // tokenVersion is only incremented after TOTP verification succeeds (in /totp/challenge).
    if (user.totpEnabled) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, loginLockedUntil: null },
      });
      const mfaToken = jwt.sign(
        { userId: user.id, type: 'mfa_challenge' },
        process.env.JWT_SECRET!,
        { expiresIn: '5m' },
      );
      return reply.send({ requiresTOTP: true, mfaToken });
    }

    // Standard login (no TOTP) — reset lockout and rotate tokenVersion
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        loginLockedUntil: null,
        tokenVersion: { increment: 1 },
      },
      select: { tokenVersion: true },
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username, tv: updatedUser.tokenVersion },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    await prisma.adminLog.create({ data: { action: 'LOGIN', actorName: user.username, targetName: user.username } }).catch((err) => { console.warn('[auth] Failed to write LOGIN audit log:', (err as Error).message); });

    reply
      .setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7, secure: process.env.COOKIE_SECURE !== 'false' })
      .send(decryptUserPii({ id: user.id, username: user.username, email: user.email, realName: user.realName, avatarEmoji: user.avatarEmoji, mustChangePassword: user.mustChangePassword, isAdmin: user.isAdmin, isFoundingAdmin: user.isFoundingAdmin, emailVerified: user.emailVerified }));
  });

  // Incrementing tokenVersion on logout invalidates ALL open sessions on every device.
  // "Log out here" and "log out everywhere" are intentionally identical — there is no
  // per-device revocation. Clients that still hold a cookie with the old tv value will
  // receive 401 on the next authenticated request.
  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { tokenVersion: { increment: 1 } },
    }).catch((err) => { console.warn('[auth] Failed to increment tokenVersion on logout:', (err as Error).message); });
    await prisma.adminLog.create({ data: { action: 'LOGOUT', actorName: req.user.username } })
      .catch((err) => { console.warn('[auth] Failed to write LOGOUT audit log:', (err as Error).message); });
    reply.clearCookie('token', { path: '/' }).send({ ok: true });
  });

  // Sliding session refresh — re-issues the cookie with a fresh 7-day maxAge.
  // Call when the user has been active and the token is within 24h of expiry.
  app.get('/api/auth/refresh', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, username: true, tokenVersion: true } });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    const token = jwt.sign(
      { userId: user.id, username: user.username, tv: user.tokenVersion },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
    reply
      .setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7, secure: process.env.COOKIE_SECURE !== 'false' })
      .send({ ok: true });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const [user, cfg] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, username: true, email: true, realName: true, avatarEmoji: true, avatarUrl: true, phone: true, emailVerified: true, isAdmin: true, isFoundingAdmin: true, mustChangePassword: true, notificationPreferences: true },
      }),
      getServerConfig(),
    ]);
    if (!user) return reply.status(404).send({ error: 'Not found' });
    reply.send({ ...decryptUserPii(user), announcementsEnabled: cfg.announcementsEnabled });
  });

}
