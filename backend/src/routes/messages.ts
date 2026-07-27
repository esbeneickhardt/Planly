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
import {
  storeFile,
  getFileBuffer,
  deleteFile,
  generateFilename,
  mimeFromExt,
  ALLOWED_MIME_TYPES,
  verifyMimeBytes,
  generateThumbnail,
  thumbnailFilename,
} from '../utils/storage';
import { sendEmail, mentionEmail } from '../utils/email';
import { createNotification } from '../utils/notifications';
import { MESSAGE_INCLUDE } from '../db/selects';
import { validate } from '../utils/validate';
import { decryptMessageAuthor } from '../utils/crypto';

// Validates attachment references; URL must point to this server's own upload path to prevent injection
const attachmentItemSchema = z.object({
  url: z
    .string()
    .regex(/^\/api\/uploads\/[a-zA-Z0-9._-]+$/, 'Invalid attachment - only uploads from this server are allowed'),
  name: z.string(),
  type: z.string(),
  thumbnailUrl: z
    .string()
    .regex(/^\/api\/uploads\/[a-zA-Z0-9._-]+$/, 'Invalid attachment - only uploads from this server are allowed')
    .optional(),
});
// Role badge values a sender can claim; verified against actual permissions at write time
const VALID_ROLES = ['Server Owner', 'Server Admin', 'Project Owner', 'Project Co-Owner'] as const;
// Message creation payload — content OR at least one attachment required; up to 20 attachments per message
const createMessageSchema = z
  .object({
    content: z.string().max(10000),
    taskId: z.string().optional(),
    replyToId: z.string().optional().nullable(),
    attachments: z.array(attachmentItemSchema).max(20).optional(),
    postedAsRole: z.enum(VALID_ROLES).nullable().optional(),
  })
  .refine((d) => d.content.trim().length > 0 || (d.attachments?.length ?? 0) > 0, {
    message: 'Message must have content or at least one attachment',
    path: ['content'],
  });
// Edit payload — content required and cannot be blank
const updateMessageSchema = z.object({ content: z.string().min(1).max(10000) });
// Validates the emoji character(s) for a reaction toggle
const addReactionSchema = z.object({ emoji: z.string().min(1).max(12) });

export async function messageRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5, fieldSize: 1024 } });

  // Upload file - returns a URL that can be embedded in messages
  app.post(
    '/api/upload',
    { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
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

      const filename = generateFilename(data.filename, ext);
      await storeFile(buf, filename, data.mimetype);

      // Track upload ownership for access control
      await prisma.fileUpload
        .create({
          data: {
            filename,
            uploaderId: req.user.userId,
            productId: productId ?? null,
          },
        })
        .catch(() => {});

      // For images, also store a downscaled thumbnail so chat bubbles don't have to load the
      // full original - falls back to no thumbnail (client uses the original) on any failure.
      let thumbnailUrl: string | undefined;
      const thumbBuf = await generateThumbnail(buf, data.mimetype);
      if (thumbBuf) {
        const thumbName = thumbnailFilename(filename);
        await storeFile(thumbBuf, thumbName, 'image/jpeg');
        await prisma.fileUpload
          .create({
            data: {
              filename: thumbName,
              uploaderId: req.user.userId,
              productId: productId ?? null,
            },
          })
          .catch(() => {});
        thumbnailUrl = `/api/uploads/${thumbName}`;
      }

      reply.send({ url: `/api/uploads/${filename}`, name: data.filename, type: data.mimetype, thumbnailUrl });
    },
  );

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
      // Clean up the derived thumbnail too, if one was generated for this upload
      const thumbName = thumbnailFilename(safe);
      await deleteFile(thumbName).catch(() => {});
      await prisma.fileUpload.delete({ where: { filename: thumbName } }).catch(() => {});
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // List messages for a product (or a specific task)
  app.get('/api/products/:productId/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    const {
      taskId,
      all,
      cursor,
      limit = '100',
    } = req.query as { taskId?: string; all?: string; cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit), 200);
    const where = all === 'true' ? { productId } : { productId, taskId: taskId ?? null };
    const messages = await prisma.message.findMany({
      where: { ...where, ...(cursor ? { createdAt: { gt: new Date(cursor) } } : {}) },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take,
    });
    reply.send(messages.map(decryptMessageAuthor));
  });

  // Create a message, broadcast it, dispatch webhooks, and notify @mentions
  app.post('/api/products/:productId/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    // Validate body first (sync), then fire the membership check and sender lookup in parallel
    const msgBody = validate(createMessageSchema, req.body, reply);
    if (!msgBody) return;
    const { content, taskId, replyToId, attachments, postedAsRole: rawRole } = msgBody;
    // Member check and sender role lookup are independent — run in parallel to save one round trip
    const [isMember, sender] = await Promise.all([
      requireProductMember(productId, req.user, reply),
      prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true, isFoundingAdmin: true } }),
    ]);
    if (!isMember) return;
    let postedAsRole: string | null = rawRole ?? null;
    if (postedAsRole === 'Server Owner' && !sender?.isFoundingAdmin) postedAsRole = null;
    if (postedAsRole === 'Server Admin' && !sender?.isAdmin) postedAsRole = null;
    const msg = await prisma.message.create({
      data: {
        productId,
        taskId: taskId ?? null,
        replyToId: replyToId ?? null,
        authorId: req.user.userId,
        content: content.trim(),
        attachments: attachments ?? [],
        postedAsRole,
      },
      include: MESSAGE_INCLUDE,
    });
    const decryptedMsg = decryptMessageAuthor(msg);
    dispatchWebhooks(productId, 'message.created', decryptedMsg).catch((err) => {
      req.log.warn({ err }, '[messages] Webhook dispatch failed');
    });
    broadcast(productId, 'message.created', decryptedMsg);
    // message.created is intentionally not logged to the activity feed — chat volume would drown out task/sprint events

    // Create notifications and optional emails for @mentioned users (fire-and-forget).
    // "@all" is a standard-chat-style shortcut that notifies every project team member instead of
    // one specific username - it takes precedence over (and is a superset of) any other @mentions
    // in the same message, so mixing "@all" with "@someone" just notifies everyone once.
    const mentionedUsernames = [...content.matchAll(/@(\w+)/g)]
      .map((m) => m[1])
      .filter((u): u is string => u !== undefined);
    const mentionsAll = mentionedUsernames.some((u) => u.toLowerCase() === 'all');
    const specificUsernames = mentionedUsernames.filter((u) => u.toLowerCase() !== 'all');
    if (mentionsAll || specificUsernames.length > 0) {
      prisma.user
        .findMany({
          where: {
            id: { not: req.user.userId },
            // Only notify users who are actually members of this project
            teams: { some: { team: { products: { some: { id: productId } } } } },
            ...(mentionsAll ? {} : { username: { in: specificUsernames } }),
          },
          select: { id: true, email: true, notificationPreferences: true },
        })
        .then(async (users) => {
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
              }).catch((err) => {
                req.log.error({ err }, '[messages] mention email failed');
              });
            }
          }
        })
        .catch((err) => {
          req.log.error({ err }, '[messages] mention notification failed');
        });
    }

    reply.status(201).send(decryptedMsg);
  });

  // Edit own message content
  app.patch('/api/products/:productId/messages/:messageId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, messageId } = req.params as { productId: string; messageId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
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
    reply.send(decryptMessageAuthor(updated));
  });

  // Delete own message
  app.delete('/api/products/:productId/messages/:messageId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, messageId } = req.params as { productId: string; messageId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    const msg = await prisma.message.findFirst({ where: { id: messageId, productId } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    await prisma.message.delete({ where: { id: messageId } });
    reply.send({ ok: true });
  });

  // Toggle emoji reaction (add if missing, remove if already present)
  app.post(
    '/api/products/:productId/messages/:messageId/reactions',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { productId, messageId } = req.params as { productId: string; messageId: string };
      if (!(await requireProductMember(productId, req.user, reply))) return;
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

      const reactions = await prisma.messageReaction.findMany({
        where: { messageId },
        select: { emoji: true, userId: true },
      });
      broadcast(productId, 'message.reacted', { messageId, reactions });
      reply.send({ reactions });
    },
  );
}
