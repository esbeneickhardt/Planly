import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

const USER_SELECT = { id: true, username: true, email: true, realName: true, avatarEmoji: true, phone: true, createdAt: true };

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users', { preHandler: requireAuth }, async (_req, reply) => {
    reply.send(await prisma.user.findMany({ select: USER_SELECT }));
  });

  app.post('/api/users', { preHandler: requireAuth }, async (req, reply) => {
    const { username, email, password, realName, phone, avatarEmoji } = req.body as {
      username: string; email: string; password: string;
      realName?: string; phone?: string; avatarEmoji?: string;
    };
    if (!username || !email || !password) return reply.status(400).send({ error: 'username, email and password required' });

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await prisma.user.create({ data: { username, email, passwordHash, realName, phone, avatarEmoji }, select: USER_SELECT });
      reply.status(201).send(user);
    } catch {
      reply.status(409).send({ error: 'Username or email already taken' });
    }
  });

  app.get('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    reply.send(user);
  });

  app.patch('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { realName, phone, avatarEmoji } = req.body as { realName?: string; phone?: string; avatarEmoji?: string };
    try {
      const user = await prisma.user.update({ where: { id }, data: { realName, phone, avatarEmoji }, select: USER_SELECT });
      reply.send(user);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.user.delete({ where: { id } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });
}
