import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { getServerConfig } from '../utils/server-config';

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const { identifier, password } = req.body as { identifier: string; password: string };
    if (!identifier || !password) return reply.status(400).send({ error: 'Email/username and password required' });

    const trimmed = identifier.trim();
    const normalized = trimmed.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { username: { equals: trimmed, mode: 'insensitive' } }] },
    });
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' });
    if (!user.passwordHash) return reply.status(401).send({ error: 'This account uses SSO - please sign in via your identity provider.' });

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
      await prisma.adminLog.create({ data: { action: 'LOGIN_FAILED', targetName: user.email, metadata: { attempts } } }).catch(() => {});
      if (shouldLock) {
        await prisma.adminLog.create({ data: { action: 'LOGIN_LOCKED', targetName: user.email } }).catch(() => {});
        return reply.status(429).send({ error: `Too many failed attempts. Account locked for ${LOGIN_LOCK_MINUTES} minutes.` });
      }
      const remaining = LOGIN_MAX_ATTEMPTS - attempts;
      return reply.status(401).send({ error: `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.` });
    }

    // Successful login - reset lockout state
    if (user.failedLoginAttempts > 0 || user.loginLockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, loginLockedUntil: null } });
    }

    const serverConfig = await getServerConfig();
    if (!user.emailVerified && serverConfig.requireEmailVerification) {
      return reply.status(403).send({ error: 'Please verify your email address before signing in. Check your inbox for a verification link.' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    await prisma.adminLog.create({ data: { action: 'LOGIN', actorName: user.username, targetName: user.email } }).catch(() => {});

    reply
      .setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
      .send({ id: user.id, username: user.username, email: user.email, realName: user.realName, avatarEmoji: user.avatarEmoji, mustChangePassword: user.mustChangePassword, isAdmin: user.isAdmin, isFoundingAdmin: user.isFoundingAdmin, emailVerified: user.emailVerified });
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true });
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
    reply.send({ ...user, announcementsEnabled: cfg.announcementsEnabled });
  });

}
