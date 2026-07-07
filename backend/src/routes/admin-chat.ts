import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAdmin } from '../middleware/auth';
import { MESSAGE_INCLUDE } from '../db/selects';
import { validate } from '../utils/validate';

const addReactionSchema = z.object({ emoji: z.string().min(1).max(12) });

const attachmentSchema = z.object({
  url: z.string().regex(/^\/api\/uploads\/[a-zA-Z0-9._-]+$/, 'Invalid attachment — only uploads from this server are allowed'),
  name: z.string(),
  type: z.string(),
});
const createMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  attachments: z.array(attachmentSchema).optional(),
});
const editMessageSchema = z.object({ content: z.string().min(1).max(10000) });

const EDIT_TIMEOUT_MS = 15 * 60 * 1000;

export async function adminChatRoutes(app: FastifyInstance) {
  app.get('/api/admin/chat', { preHandler: requireAdmin }, async (req, reply) => {
    const { cursor, limit = '200' } = req.query as { cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit), 500);
    const messages = await prisma.message.findMany({
      where: { isAdminChat: true, ...(cursor ? { createdAt: { gt: new Date(cursor) } } : {}) },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take,
    });
    reply.send(messages);
  });

  app.post('/api/admin/chat', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'content required' });
    const { content, attachments } = parsed.data;
    const msg = await prisma.message.create({
      data: { isAdminChat: true, authorId: req.user.userId, content: content.trim(), attachments: attachments ?? [] },
      include: MESSAGE_INCLUDE,
    });
    reply.status(201).send(msg);
  });

  app.patch('/api/admin/chat/:messageId', { preHandler: requireAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const editParsed = editMessageSchema.safeParse(req.body);
    if (!editParsed.success) return reply.status(400).send({ error: editParsed.error.issues[0]?.message ?? 'content required' });
    const { content } = editParsed.data;
    const msg = await prisma.message.findFirst({ where: { id: messageId, isAdminChat: true } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    if (Date.now() - msg.createdAt.getTime() > EDIT_TIMEOUT_MS) return reply.status(403).send({ error: 'Edit window expired' });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      include: MESSAGE_INCLUDE,
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
    const body = validate(addReactionSchema, req.body, reply);
    if (!body) return;
    const { emoji } = body;
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
