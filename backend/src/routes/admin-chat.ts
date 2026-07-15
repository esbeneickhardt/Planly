/**
 * Admin chat routes - the private admin-only message channel.
 *
 * Admin chat is a server-wide message thread visible only to users with isAdmin: true.
 * It supports the same features as project messages (emoji reactions, file attachments)
 * but is scoped to administrators. Used for internal ops communication.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAdmin } from '../middleware/auth';
import { MESSAGE_INCLUDE } from '../db/selects';
import { validate } from '../utils/validate';

// Request body schemas
const addReactionSchema = z.object({ emoji: z.string().min(1).max(12) });

const attachmentSchema = z.object({
  // Restrict attachment URLs to this server's own upload paths to prevent link-injection
  url: z.string().regex(/^\/api\/uploads\/[a-zA-Z0-9._-]+$/, 'Invalid attachment - only uploads from this server are allowed'),
  name: z.string(),
  type: z.string(),
});
const createMessageSchema = z.object({
  content: z.string().max(10000),
  attachments: z.array(attachmentSchema).optional(),
}).refine((d) => d.content.trim().length > 0 || (d.attachments?.length ?? 0) > 0, {
  message: 'Message must have content or at least one attachment',
  path: ['content'],
});
const editMessageSchema = z.object({ content: z.string().min(1).max(10000) });

// 15-minute window after posting during which an author can edit their message
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
    const body = validate(createMessageSchema, req.body, reply);
    if (!body) return;
    const { content, attachments } = body;
    const msg = await prisma.message.create({
      data: { isAdminChat: true, authorId: req.user.userId, content: content.trim(), attachments: attachments ?? [] },
      include: MESSAGE_INCLUDE,
    });
    reply.status(201).send(msg);
  });

  app.patch('/api/admin/chat/:messageId', { preHandler: requireAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const editBody = validate(editMessageSchema, req.body, reply);
    if (!editBody) return;
    const { content } = editBody;
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

    // Toggle: remove if the user already reacted with this emoji, otherwise add
    const key = { messageId, userId: req.user.userId, emoji };
    const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId_emoji: key } });
    if (existing) {
      await prisma.messageReaction.delete({ where: { messageId_userId_emoji: key } });
    } else {
      await prisma.messageReaction.create({ data: key });
    }
    // Return the full updated reaction set so the client can replace its local state
    const reactions = await prisma.messageReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
    reply.send({ reactions });
  });
}
