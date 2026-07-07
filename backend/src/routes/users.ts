import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { handleNotFound } from '../utils/prisma-errors';
import { config } from '../config/env';
import { sendEmail } from '../utils/email';
import { getServerConfig } from '../utils/server-config';
import { z } from 'zod';
import { validate } from '../utils/validate';
import { registerSchema } from '../schemas/auth';
import { encryptOptional, decryptUserPii } from '../utils/crypto';

const updateProfileSchema = z.object({
  realName: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  avatarEmoji: z.string().max(8).optional(),
  avatarUrl: z.string().url().max(2048).startsWith('https').nullable().optional(),
});
const updatePreferencesSchema = z.object({
  preferences: z.record(z.string().max(100), z.boolean()),
});

// Public profile fields - never expose passwordHash
const USER_SELF_SELECT = {
  id: true, username: true, email: true, realName: true,
  avatarEmoji: true, avatarUrl: true, phone: true, createdAt: true, emailVerified: true,
  notificationPreferences: true,
};
// Minimal fields for team member search - no email, phone, or createdAt
const USER_PUBLIC_SELECT = { id: true, username: true, avatarEmoji: true };

export async function userRoutes(app: FastifyInstance) {
  // Global user search: minimal fields only (used for team member lookup)
  app.get('/api/users', { preHandler: requireAuth }, async (req, reply) => {
    const { cursor, limit = '200' } = req.query as { cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit) || 200, 500);
    const users = await prisma.user.findMany({
      select: USER_PUBLIC_SELECT,
      orderBy: { username: 'asc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const nextCursor = users.length === take ? (users[users.length - 1]?.id ?? null) : null;
    reply.send({ users, nextCursor });
  });

  // Registration - public endpoint with tighter rate limit
  app.post('/api/users', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const parsed = validate(registerSchema, req.body, reply);
    if (!parsed) return;
    const { username, email: normalizedEmail, password, realName, phone, avatarEmoji } = parsed;
    const tosAcceptedAt = new Date();

    const serverConfig = await getServerConfig();

    // Whitelist check
    if (serverConfig.requireWhitelist) {
      const patterns = await prisma.emailWhitelist.findMany();
      const allowed = patterns.some(({ pattern }) => {
        if (pattern.startsWith('@')) return normalizedEmail.endsWith(pattern);
        return normalizedEmail === pattern.toLowerCase();
      });
      if (!allowed) {
        return reply.status(403).send({ error: 'This email address is not on the allowed list. Contact the server administrator.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let user: { id: string; username: string; email: string; realName: string | null; avatarEmoji: string | null; avatarUrl: string | null; phone: string | null; createdAt: Date; emailVerified: boolean };
    try {
      user = await prisma.user.create({
        data: {
          username: username.trim(), email: normalizedEmail,
          passwordHash, realName: encryptOptional(realName?.trim()), phone: encryptOptional(phone?.trim()), avatarEmoji,
          emailVerified: false,
          tosAcceptedAt,
          tosVersion: '1.0',
        },
        select: USER_SELF_SELECT,
      });
    } catch {
      return reply.status(409).send({ error: 'Username or email already taken' });
    }

    // Send verification email when verification is enforced (user must click link before logging in)
    if (serverConfig.requireEmailVerification) {
      try {
        const rawToken = randomBytes(32).toString('hex');
        const { createHash } = await import('crypto');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        await prisma.emailVerifyToken.create({
          data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        });
        const verifyUrl = `${config.appUrl}/verify-email?token=${rawToken}`;
        await sendEmail({
          to: user.email,
          subject: 'Verify your Planly email address',
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 16px">Verify your email</h2>
            <p>Hi ${user.username.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')},</p>
            <p>Click the button below to verify your email address. The link expires in 24 hours.</p>
            <p style="margin:24px 0"><a href="${verifyUrl}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify email →</a></p>
            <p style="color:#aaa;font-size:12px">If you didn't create a Planly account, you can ignore this email.</p>
          </div>`,
        });
      } catch {
        // Non-fatal - user can request a new link later
      }
    }

    await prisma.adminLog.create({ data: { action: 'USER_REGISTERED', actorName: user.username, targetName: user.username } });
    reply.status(201).send(decryptUserPii(user));
  });

  // Get own profile (full fields) or another user's public profile
  app.get('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const isSelf = id === req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id },
      select: isSelf ? USER_SELF_SELECT : USER_PUBLIC_SELECT,
    });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    reply.send(isSelf ? decryptUserPii(user as Parameters<typeof decryptUserPii>[0]) : user);
  });

  // Update own profile only
  app.patch('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    const profileBody = validate(updateProfileSchema, req.body, reply);
    if (!profileBody) return;
    const { realName, phone, avatarEmoji, avatarUrl } = profileBody;
    try {
      const user = await prisma.user.update({
        where: { id },
        data: { realName: encryptOptional(realName), phone: encryptOptional(phone), avatarEmoji, avatarUrl },
        select: USER_SELF_SELECT,
      });
      reply.send(decryptUserPii(user));
    } catch (e) { handleNotFound(e, reply); }
  });

  // Update notification preferences
  app.patch('/api/users/:id/notification-preferences', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    const prefBody = validate(updatePreferencesSchema, req.body, reply);
    if (!prefBody) return;
    const { preferences } = prefBody;
    if (Object.keys(preferences).length > 50) return reply.status(400).send({ error: 'Too many preference keys (max 50)' });
    try {
      const user = await prisma.user.update({
        where: { id },
        data: { notificationPreferences: preferences },
        select: { notificationPreferences: true },
      });
      reply.send(user);
    } catch (e) { handleNotFound(e, reply); }
  });

  // Delete own account only
  app.delete('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    try {
      await prisma.user.delete({ where: { id } });
      reply.send({ ok: true });
    } catch (e) { handleNotFound(e, reply); }
  });
}
