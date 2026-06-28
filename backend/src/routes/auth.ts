import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const { identifier, password } = req.body as { identifier: string; password: string };
    if (!identifier || !password) return reply.status(400).send({ error: 'Email/username and password required' });

    const normalized = identifier.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { username: normalized }] },
    });
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' });
    if (!user.passwordHash) return reply.status(401).send({ error: 'This account uses SSO — please sign in via your identity provider.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    reply
      .setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
      .send({ id: user.id, username: user.username, email: user.email, realName: user.realName, avatarEmoji: user.avatarEmoji });
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, email: true, realName: true, avatarEmoji: true, avatarUrl: true, phone: true, emailVerified: true },
    });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    reply.send(user);
  });
}
