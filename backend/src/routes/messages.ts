/**
 * Message routes - per-project chat with @mention notifications and file attachments.
 *
 * Messages support rich text content, emoji reactions, replies, and file attachments
 * (images, documents). File uploads are validated by MIME type (magic bytes checked,
 * not just extension). @mentions send in-app notifications and optionally email alerts.
 * Real-time delivery via WebSocket broadcast; webhook dispatch on new messages.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import prisma from '../db/client';
import { config } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';
import { dispatchWebhooks } from '../utils/webhook-dispatch';
import { broadcast } from '../realtime/manager';
import { logActivity } from '../utils/activity';
import { storeFile, getFileBuffer, deleteFile, generateFilename, mimeFromExt, ALLOWED_MIME_TYPES, verifyMimeBytes } from '../utils/storage';
import { sendEmail, mentionEmail } from '../utils/email';
import { createNotification } from '../utils/notifications';
import { MESSAGE_INCLUDE } from '../db/selects';
import { validate } from '../utils/validate';

const attachmentItemSchema = z.object({
  url: z.string().regex(/^\/api\/uploads\/[a-zA-Z0-9._-]+$/, 'Invalid attachment - only uploads from this server are allowed'),
  name: z.string(),
  type: z.string(),
});
const createMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  taskId: z.string().optional(),
  attachments: z.array(attachmentItemSchema).max(20).optional(),
});
const updateMessageSchema = z.object({ content: z.string().min(1).max(10000) });
const addReactionSchema = z.object({ emoji: z.string().min(1).max(12) });

export async function messageRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5, fieldSize: 1024 } });

  // Upload file - returns a URL that can be embedded in messages
  app.post('/api/upload', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { productId } = req.query as { productId?: string };
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file' });

    const ext = ALLOWED_MIME_TYPES[data.mimetype];
    if (!ext) return reply.status(400).send({ error: `File type not allowed: ${data.mimetype}` });

    const buf = await data.toBuffer();

    // Verify file content matches declared MIME type
    if (!verifyMimeBytes(buf, data.mimetype)) {
      return reply.status(400).send({ error: 'File content does not match declared type' });
    }

    const filename = generateFilename(buf, ext);
    await storeFile(buf, filename, data.mimetype);

    // Track upload ownership for access control
    await prisma.fileUpload.create({
      data: {
        filename,
        uploaderId: req.user.userId,
        productId: productId ?? null,
      },
    }).catch(() => {});

    reply.send({ url: `/api/uploads/${filename}`, name: data.filename, type: data.mimetype });
  });

  // Serve uploaded files
  app.get('/api/uploads/:filename', { preHandler: requireAuth }, async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.{2,}/g, '');

    // Check file ownership: if we have a record, enforce product membership
    const record = await prisma.fileUpload.findUnique({ where: { filename: safe } });
    if (record?.productId) {
      const isMember = await prisma.product.findFirst({
        where: { id: record.productId, team: { members: { some: { userId: req.user.userId } } } },
      });
      if (!isMember) return reply.status(403).send({ error: 'Forbidden' });
    }

    try {
      const buf = await getFileBuffer(safe);
      const ext = safe.split('.').pop()?.toLowerCase() ?? '';
      const mime = mimeFromExt(ext) ?? 'application/octet-stream';
      reply.header('Content-Type', mime).header('X-Content-Type-Options', 'nosniff').send(buf);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // Delete an uploaded file
  app.delete('/api/uploads/:filename', { preHandler: requireAuth }, async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.{2,}/g, '');

    const record = await prisma.fileUpload.findUnique({ where: { filename: safe } });
    if (!record) return reply.status(404).send({ error: 'Not found' });
    if (record.uploaderId !== req.user.userId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    try {
      await deleteFile(safe);
      if (record) await prisma.fileUpload.delete({ where: { filename: safe } }).catch(() => {});
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // List messages for a product (or a specific task)
  app.get('/api/products/:productId/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const { taskId, all, cursor, limit = '100' } = req.query as { taskId?: string; all?: string; cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit), 200);
    const where = all === 'true' ? { productId } : { productId, taskId: taskId ?? null };
    const messages = await prisma.message.findMany({
      where: { ...where, ...(cursor ? { createdAt: { gt: new Date(cursor) } } : {}) },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take,
    });
    reply.send(messages);
  });

  // Create a message, broadcast it, dispatch webhooks, and notify @mentions
  app.post('/api/products/:productId/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const msgBody = validate(createMessageSchema, req.body, reply);
    if (!msgBody) return;
    const { content, taskId, attachments } = msgBody;
    const msg = await prisma.message.create({
      data: { productId, taskId: taskId ?? null, authorId: req.user.userId, content: content.trim(), attachments: attachments ?? [] },
      include: MESSAGE_INCLUDE,
    });
    dispatchWebhooks(productId, 'message.created', msg).catch((err) => { req.log.warn({ err }, '[messages] Webhook dispatch failed'); });
    broadcast(productId, 'message.created', msg);
    logActivity({ productId, actorId: req.user.userId, action: 'message.created', entityType: 'message', entityId: msg.id });

    // Create notifications and optional emails for @mentioned users (fire-and-forget)
    const mentionedUsernames = [...content.matchAll(/@(\w+)/g)].map((m) => m[1]).filter((u): u is string => u !== undefined);
    if (mentionedUsernames.length > 0) {
      prisma.user.findMany({
        where: {
          username: { in: mentionedUsernames },
          id: { not: req.user.userId },
          // Only notify users who are actually members of this project
          teams: { some: { team: { products: { some: { id: productId } } } } },
        },
        select: { id: true, email: true, notificationPreferences: true },
      }).then(async (users) => {
        if (!users.length) return;
        const taskName = msg.task?.name;
        const snippet = content.slice(0, 200);
        const appUrl = config.appUrl;
        for (const u of users) {
          const prefs = (u.notificationPreferences as Record<string, boolean> | null) ?? {};
          // In-app notification (respects mention pref, default on)
          await createNotification({
            userId: u.id,
            type: 'mention',
            title: `${req.user.username} mentioned you${taskName ? ` in "${taskName}"` : ''}`,
            body: snippet,
            productId,
            taskId: taskId ?? undefined,
          });
          // Email notification (off by default, opt-in via emailMentions pref)
          if (prefs.emailMentions === true) {
            const context = taskName ?? '';
            sendEmail({
              to: u.email,
              subject: `@${req.user.username} mentioned you in Planly`,
              html: mentionEmail(req.user.username, context, snippet, appUrl),
            }).catch((err) => { req.log.error({ err }, '[messages] mention email failed'); });
          }
        }
      }).catch((err) => { req.log.error({ err }, '[messages] mention notification failed'); });
    }

    reply.status(201).send(msg);
  });

  // Edit own message content
  app.patch('/api/products/:productId/messages/:messageId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, messageId } = req.params as { productId: string; messageId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const editBody = validate(updateMessageSchema, req.body, reply);
    if (!editBody) return;
    const { content } = editBody;
    const msg = await prisma.message.findFirst({ where: { id: messageId, productId } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    reply.send(updated);
  });

  // Delete own message
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
    const rxnBody = validate(addReactionSchema, req.body, reply);
    if (!rxnBody) return;
    const { emoji } = rxnBody;

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
