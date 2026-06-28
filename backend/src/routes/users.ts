import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

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
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await prisma.user.create({
        data: {
          username: username.trim(), email: email.toLowerCase().trim(),
          passwordHash, realName: realName?.trim() || undefined, phone: phone?.trim() || undefined, avatarEmoji,
        },
        select: USER_SELF_SELECT,
      });
      reply.status(201).send(user);
    } catch {
      reply.status(409).send({ error: 'Username or email already taken' });
    }
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
