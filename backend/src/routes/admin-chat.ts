import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAdmin } from '../middleware/auth';

const AUTHOR_SELECT = { id: true, username: true, realName: true, avatarEmoji: true };
const MSG_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  task: { select: { id: true, name: true } },
  reactions: { select: { emoji: true, userId: true } },
} as const;

const EDIT_TIMEOUT_MS = 15 * 60 * 1000;

export async function adminChatRoutes(app: FastifyInstance) {
  app.get('/api/admin/chat', { preHandler: requireAdmin }, async (req, reply) => {
    const { cursor, limit = '200' } = req.query as { cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit), 500);
    const messages = await prisma.message.findMany({
      where: { isAdminChat: true, ...(cursor ? { createdAt: { gt: new Date(cursor) } } : {}) },
      include: MSG_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take,
    });
    reply.send(messages);
  });

  app.post('/api/admin/chat', { preHandler: requireAdmin }, async (req, reply) => {
    const { content, attachments } = req.body as {
      content: string;
      attachments?: { url: string; name: string; type: string }[];
    };
    if (!content?.trim()) return reply.status(400).send({ error: 'content required' });
    if (content.length > 10000) return reply.status(400).send({ error: 'content too long (max 10000)' });
    const msg = await prisma.message.create({
      data: { isAdminChat: true, authorId: req.user.userId, content: content.trim(), attachments: attachments ?? [] },
      include: MSG_INCLUDE,
    });
    reply.status(201).send(msg);
  });

  app.patch('/api/admin/chat/:messageId', { preHandler: requireAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const { content } = req.body as { content: string };
    const msg = await prisma.message.findFirst({ where: { id: messageId, isAdminChat: true } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    if (Date.now() - msg.createdAt.getTime() > EDIT_TIMEOUT_MS) return reply.status(403).send({ error: 'Edit window expired' });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      include: MSG_INCLUDE,
    });
    reply.send(updated);
  });

  app.delete('/api/admin/chat/:messageId', { preHandler: requireAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const msg = await prisma.message.findFirst({ where: { id: messageId, isAdminChat: true } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    await prisma.message.delete({ where: { id: messageId } });
    reply.send({ ok: true });
  });

  app.post('/api/admin/chat/:messageId/reactions', { preHandler: requireAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const { emoji } = req.body as { emoji: string };
    if (!emoji || typeof emoji !== 'string' || emoji.length > 12) return reply.status(400).send({ error: 'invalid emoji' });
    const msg = await prisma.message.findFirst({ where: { id: messageId, isAdminChat: true } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });

    const key = { messageId, userId: req.user.userId, emoji };
    const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId_emoji: key } });
    if (existing) {
      await prisma.messageReaction.delete({ where: { messageId_userId_emoji: key } });
    } else {
      await prisma.messageReaction.create({ data: key });
    }
    const reactions = await prisma.messageReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
    reply.send({ reactions });
  });
}
