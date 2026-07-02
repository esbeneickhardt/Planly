import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { config } from '../config/env';
import { sendEmail } from '../utils/email';
import { getServerConfig } from '../utils/server-config';

// Public profile fields — never expose passwordHash
const USER_SELF_SELECT = {
  id: true, username: true, email: true, realName: true,
  avatarEmoji: true, avatarUrl: true, phone: true, createdAt: true, emailVerified: true,
};
// Minimal fields for team member search — no email, phone, or createdAt
const USER_PUBLIC_SELECT = { id: true, username: true, avatarEmoji: true };

export async function userRoutes(app: FastifyInstance) {
  // Global user search: minimal fields only (used for team member lookup)
  app.get('/api/users', { preHandler: requireAuth }, async (_req, reply) => {
    reply.send(await prisma.user.findMany({ select: USER_PUBLIC_SELECT, orderBy: { username: 'asc' } }));
  });

  // Registration — public endpoint
  app.post('/api/users', async (req, reply) => {
    const { username, email, password, realName, phone, avatarEmoji } = req.body as {
      username: string; email: string; password: string;
      realName?: string; phone?: string; avatarEmoji?: string;
    };
    if (!username?.trim() || !email?.trim() || !password) {
      return reply.status(400).send({ error: 'username, email and password required' });
    }
    if (!/^[a-zA-Z0-9_-]{2,32}$/.test(username.trim())) {
      return reply.status(400).send({ error: 'Username must be 2–32 characters (letters, numbers, _ or -)' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return reply.status(400).send({ error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }
    if (realName && realName.length > 100) {
      return reply.status(400).send({ error: 'Name too long' });
    }

    const normalizedEmail = email.toLowerCase().trim();

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
          passwordHash, realName: realName?.trim() || undefined, phone: phone?.trim() || undefined, avatarEmoji,
          emailVerified: false,
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
            <p>Hi ${user.username},</p>
            <p>Click the button below to verify your email address. The link expires in 24 hours.</p>
            <p style="margin:24px 0"><a href="${verifyUrl}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify email →</a></p>
            <p style="color:#aaa;font-size:12px">If you didn't create a Planly account, you can ignore this email.</p>
          </div>`,
        });
      } catch {
        // Non-fatal — user can request a new link later
      }
    }

    await prisma.adminLog.create({ data: { action: 'USER_REGISTERED', actorName: user.username, targetName: user.email } });
    reply.status(201).send(user);
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
    reply.send(user);
  });

  // Update own profile only
  app.patch('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    const { realName, phone, avatarEmoji, avatarUrl } = req.body as {
      realName?: string; phone?: string; avatarEmoji?: string; avatarUrl?: string | null;
    };
    try {
      const user = await prisma.user.update({
        where: { id },
        data: { realName, phone, avatarEmoji, avatarUrl },
        select: USER_SELF_SELECT,
      });
      reply.send(user);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // Delete own account only
  app.delete('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    try {
      await prisma.user.delete({ where: { id } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });
}
