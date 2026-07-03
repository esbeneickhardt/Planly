import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';
import { dispatchWebhooks } from '../utils/webhook-dispatch';
import { broadcast } from '../realtime/manager';
import { logActivity } from '../utils/activity';
import { storeFile, getFileBuffer, deleteFile, fileExtFromMime, generateFilename, mimeFromExt, ALLOWED_MIME_TYPES } from '../utils/storage';

const AUTHOR_SELECT = { id: true, username: true, avatarEmoji: true };
const MSG_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  task: { select: { id: true, name: true } },
  reactions: { select: { emoji: true, userId: true } },
} as const;


export async function messageRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  // Upload file - returns a URL that can be embedded in messages
  app.post('/api/upload', { preHandler: requireAuth }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file' });

    const ext = ALLOWED_MIME_TYPES[data.mimetype];
    if (!ext) return reply.status(400).send({ error: `File type not allowed: ${data.mimetype}` });

    const buf = await data.toBuffer();
    const filename = generateFilename(buf, ext);
    await storeFile(buf, filename, data.mimetype);
    reply.send({ url: `/api/uploads/${filename}`, name: data.filename, type: data.mimetype });
  });

  // Serve uploaded files - requires auth to prevent public URL enumeration
  app.get('/api/uploads/:filename', { preHandler: requireAuth }, async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    try {
      const buf = await getFileBuffer(safe);
      const ext = safe.split('.').pop()?.toLowerCase() ?? '';
      reply.header('Content-Type', mimeFromExt(ext) ?? 'application/octet-stream').send(buf);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // Delete an uploaded file
  app.delete('/api/uploads/:filename', { preHandler: requireAuth }, async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    try {
      await deleteFile(safe);
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.get('/api/products/:productId/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const { taskId, all, cursor, limit = '100' } = req.query as { taskId?: string; all?: string; cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit), 200);
    const where = all === 'true' ? { productId } : { productId, taskId: taskId ?? null };
    const messages = await prisma.message.findMany({
      where: { ...where, ...(cursor ? { createdAt: { gt: new Date(cursor) } } : {}) },
      include: MSG_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take,
    });
    reply.send(messages);
  });

  app.post('/api/products/:productId/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const { content, taskId, attachments } = req.body as {
      content: string;
      taskId?: string;
      attachments?: { url: string; name: string; type: string }[];
    };
    if (!content?.trim()) return reply.status(400).send({ error: 'content required' });
    if (content.length > 10000) return reply.status(400).send({ error: 'content too long (max 10000)' });
    const msg = await prisma.message.create({
      data: { productId, taskId: taskId ?? null, authorId: req.user.userId, content: content.trim(), attachments: attachments ?? [] },
      include: MSG_INCLUDE,
    });
    dispatchWebhooks(productId, 'message.created', msg).catch(() => {});
    broadcast(productId, 'message.created', msg);
    logActivity({ productId, actorId: req.user.userId, action: 'message.created', entityType: 'message', entityId: msg.id });

    // Create notifications for @mentioned users (fire-and-forget)
    const mentionedUsernames = [...content.matchAll(/@(\w+)/g)].map((m) => m[1]);
    if (mentionedUsernames.length > 0) {
      prisma.user.findMany({
        where: { username: { in: mentionedUsernames }, id: { not: req.user.userId } },
        select: { id: true },
      }).then((users) => {
        if (!users.length) return;
        const taskName = msg.task?.name;
        const snippet = content.slice(0, 200);
        return prisma.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            type: 'mention',
            title: `${req.user.username} mentioned you${taskName ? ` in "${taskName}"` : ''}`,
            body: snippet,
            productId,
            taskId: taskId ?? null,
          })),
          skipDuplicates: true,
        });
      }).catch(() => {});
    }

    reply.status(201).send(msg);
  });

  app.patch('/api/products/:productId/messages/:messageId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, messageId } = req.params as { productId: string; messageId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const { content } = req.body as { content: string };
    const msg = await prisma.message.findFirst({ where: { id: messageId, productId } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: MSG_INCLUDE,
    });
    reply.send(updated);
  });

  app.delete('/api/products/:productId/messages/:messageId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, messageId } = req.params as { productId: string; messageId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const msg = await prisma.message.findFirst({ where: { id: messageId, productId } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    await prisma.message.delete({ where: { id: messageId } });
    reply.send({ ok: true });
  });

  // Toggle emoji reaction (add if missing, remove if already present)
  app.post('/api/products/:productId/messages/:messageId/reactions', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, messageId } = req.params as { productId: string; messageId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const { emoji } = req.body as { emoji: string };
    if (!emoji || typeof emoji !== 'string' || emoji.length > 12) return reply.status(400).send({ error: 'invalid emoji' });

    const key = { messageId, userId: req.user.userId, emoji };
    const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId_emoji: key } });
    if (existing) {
      await prisma.messageReaction.delete({ where: { messageId_userId_emoji: key } });
    } else {
      await prisma.messageReaction.create({ data: key });
    }

    const reactions = await prisma.messageReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
    broadcast(productId, 'message.reacted', { messageId, reactions });
    reply.send({ reactions });
  });
}
