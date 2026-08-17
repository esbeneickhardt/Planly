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
import { decryptMessageAuthor } from '../utils/crypto';

// Validates the emoji character(s) for a reaction toggle
const addReactionSchema = z.object({ emoji: z.string().min(1).max(12) });

// Validates attachment references; URL must be a server-local upload path to prevent link injection
const attachmentSchema = z.object({
  // Restrict attachment URLs to this server's own upload paths to prevent link-injection
  url: z
    .string()
    .regex(/^\/api\/uploads\/[a-zA-Z0-9._-]+$/, 'Invalid attachment - only uploads from this server are allowed'),
  name: z.string(),
  type: z.string(),
});
// Role badge values accepted in admin chat (server-level roles only)
const VALID_ROLES = ['Server Owner', 'Server Admin', 'Project Owner', 'Project Co-Owner'] as const;
// Message creation payload - content OR at least one attachment required
const createMessageSchema = z
  .object({
    content: z.string().max(10000),
    replyToId: z.string().optional().nullable(),
    attachments: z.array(attachmentSchema).optional(),
    postedAsRole: z.enum(VALID_ROLES).nullable().optional(),
  })
  .refine((d) => d.content.trim().length > 0 || (d.attachments?.length ?? 0) > 0, {
    message: 'Message must have content or at least one attachment',
    path: ['content'],
  });
// Edit payload - content is required and cannot be blank
const editMessageSchema = z.object({ content: z.string().min(1).max(10000) });

// 15-minute window after posting during which an author can edit their message
const EDIT_TIMEOUT_MS = 15 * 60 * 1000;

export async function adminChatRoutes(app: FastifyInstance) {
  // Paginated fetch of admin chat history. `cursor` moves forward in time (catch-up polling);
  // `before` fetches older history (lazy-load on scroll-up). With neither, returns the LATEST
  // `limit` messages (not the oldest) so a long-running admin channel doesn't get stuck showing
  // only its earliest messages. An optional `q` switches to a search mode instead: most-recent-
  // first, content match, capped at 20 - a different shape of query than the chronological one.
  app.get('/api/admin/chat', { preHandler: requireAdmin }, async (req, reply) => {
    const {
      cursor,
      before,
      limit = '200',
      q,
    } = req.query as {
      cursor?: string;
      before?: string;
      limit?: string;
      q?: string;
    };
    const query = q?.trim();
    if (query && query.length >= 2) {
      const messages = await prisma.message.findMany({
        where: {
          isAdminChat: true,
          content: { contains: query, mode: 'insensitive' },
        },
        include: MESSAGE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return reply.send(messages.map(decryptMessageAuthor));
    }
    const take = Math.min(parseInt(limit), 500);
    const latestMode = !cursor && !before;
    const messages = await prisma.message.findMany({
      where: {
        isAdminChat: true,
        ...(cursor ? { createdAt: { gt: new Date(cursor) } } : {}),
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: latestMode || before ? 'desc' : 'asc' },
      take,
    });
    const ordered = latestMode || before ? messages.reverse() : messages;
    reply.send(ordered.map(decryptMessageAuthor));
  });

  // Post a message to the admin chat channel
  app.post('/api/admin/chat', { preHandler: requireAdmin }, async (req, reply) => {
    const body = validate(createMessageSchema, req.body, reply);
    if (!body) return;
    const { content, replyToId, attachments, postedAsRole: rawRole } = body;
    // Validate claimed role; admin chat only ever shows server-level roles
    const sender = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isAdmin: true, isFoundingAdmin: true },
    });
    let postedAsRole: string | null = rawRole ?? null;
    if (postedAsRole === 'Server Owner' && !sender?.isFoundingAdmin) postedAsRole = null;
    if (postedAsRole === 'Server Admin' && !sender?.isAdmin) postedAsRole = null;
    // Admin chat has no product/team context to check a "Project Owner"/"Project Co-Owner" claim
    // against (unlike project chat or a team-scoped announcement) - since there's nothing to
    // verify the claim against, it can never be trusted here and is always rejected, the same
    // treatment a failed Server Owner/Admin check gets above.
    if (postedAsRole === 'Project Owner' || postedAsRole === 'Project Co-Owner') postedAsRole = null;
    const msg = await prisma.message.create({
      data: {
        isAdminChat: true,
        replyToId: replyToId ?? null,
        authorId: req.user.userId,
        content: content.trim(),
        attachments: attachments ?? [],
        postedAsRole,
      },
      include: MESSAGE_INCLUDE,
    });
    reply.status(201).send(decryptMessageAuthor(msg));
  });

  // Edit an admin chat message (author only, within the 15-minute edit window)
  app.patch('/api/admin/chat/:messageId', { preHandler: requireAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const editBody = validate(editMessageSchema, req.body, reply);
    if (!editBody) return;
    const { content } = editBody;
    const msg = await prisma.message.findFirst({
      where: { id: messageId, isAdminChat: true },
    });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    if (Date.now() - msg.createdAt.getTime() > EDIT_TIMEOUT_MS)
      return reply.status(403).send({ error: 'Edit window expired' });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    reply.send(decryptMessageAuthor(updated));
  });

  // Delete an admin chat message (author only)
  app.delete('/api/admin/chat/:messageId', { preHandler: requireAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const msg = await prisma.message.findFirst({
      where: { id: messageId, isAdminChat: true },
    });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    await prisma.message.delete({ where: { id: messageId } });
    reply.send({ ok: true });
  });

  // Toggle an emoji reaction on an admin chat message
  app.post('/api/admin/chat/:messageId/reactions', { preHandler: requireAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const body = validate(addReactionSchema, req.body, reply);
    if (!body) return;
    const { emoji } = body;
    const msg = await prisma.message.findFirst({
      where: { id: messageId, isAdminChat: true },
    });
    if (!msg) return reply.status(404).send({ error: 'Not found' });

    // Toggle: remove if the user already reacted with this emoji, otherwise add
    const key = { messageId, userId: req.user.userId, emoji };
    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: key },
    });
    if (existing) {
      await prisma.messageReaction.delete({
        where: { messageId_userId_emoji: key },
      });
    } else {
      await prisma.messageReaction.create({ data: key });
    }
    // Return the full updated reaction set so the client can replace its local state
    const reactions = await prisma.messageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    });
    reply.send({ reactions });
  });
}
