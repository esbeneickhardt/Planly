/**
 * Direct message conversation routes.
 *
 * Conversations are scoped by `isAdminChat` so project-context DMs and
 * admin-context DMs are kept separate and never bleed into each other.
 * Pass `?admin=true` on list/create to work in the admin scope.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../utils/validate';
import { createNotification } from '../utils/notifications';
import { safeDecryptValue } from '../utils/crypto';

const sendSchema = z.object({ content: z.string().min(1).max(10000), replyToId: z.string().optional().nullable() });
const createSchema = z.object({ participantId: z.string(), isAdminChat: z.boolean().optional() });

const AUTHOR_SELECT = { id: true, username: true, realName: true, avatarEmoji: true, isAdmin: true, isFoundingAdmin: true };
const DM_REPLY_SELECT = { id: true, content: true, author: { select: AUTHOR_SELECT } };

function decryptAuthor<T extends { author: { realName: string | null }; replyTo?: { author: { realName: string | null } } | null }>(msg: T): T {
  return {
    ...msg,
    author: { ...msg.author, realName: msg.author.realName ? safeDecryptValue(msg.author.realName) : null },
    replyTo: msg.replyTo ? { ...msg.replyTo, author: { ...msg.replyTo.author, realName: msg.replyTo.author.realName ? safeDecryptValue(msg.replyTo.author.realName) : null } } : msg.replyTo,
  };
}

export async function conversationRoutes(app: FastifyInstance) {
  // List conversations scoped to the requested context (?admin=true for admin chat)
  app.get('/api/conversations', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const isAdminChat = (req.query as { admin?: string }).admin === 'true';

    const participations = await prisma.conversationParticipant.findMany({
      where: { userId, conversation: { isAdminChat } },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: AUTHOR_SELECT } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    const result = participations.map((p) => {
      const other = p.conversation.participants.find((x) => x.userId !== userId);
      const lastMsg = p.conversation.messages[0] ?? null;
      const unread = p.lastReadAt
        ? p.conversation.messages.filter((m) => new Date(m.createdAt) > new Date(p.lastReadAt!)).length
        : p.conversation.messages.length;
      return {
        id: p.conversation.id,
        closed: (p.conversation as { closed?: boolean }).closed ?? false,
        other: other ? { ...other.user, realName: other.user.realName ? safeDecryptValue(other.user.realName) : null } : null,
        lastMessage: lastMsg ? decryptAuthor({ ...lastMsg, author: other?.user ?? { id: '', username: '', realName: null, avatarEmoji: null } }) : null,
        unread,
        lastReadAt: p.lastReadAt,
        updatedAt: lastMsg?.createdAt ?? p.conversation.createdAt,
      };
    });

    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    reply.send({ conversations: result });
  });

  // Find or create a scoped 1:1 conversation
  app.post('/api/conversations', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const body = validate(createSchema, req.body, reply);
    if (!body) return;
    const { participantId, isAdminChat = false } = body;
    if (participantId === userId) return reply.status(400).send({ error: 'Cannot start a conversation with yourself' });

    const other = await prisma.user.findUnique({ where: { id: participantId }, select: { id: true } });
    if (!other) return reply.status(404).send({ error: 'User not found' });

    // Look for an existing conversation with the same scope between these two users
    const existing = await prisma.conversationParticipant.findFirst({
      where: {
        userId,
        conversation: { isAdminChat, participants: { some: { userId: participantId } } },
      },
      select: { conversationId: true },
    });
    if (existing) return reply.send({ id: existing.conversationId });

    const conv = await prisma.conversation.create({
      data: {
        isAdminChat,
        participants: { create: [{ userId }, { userId: participantId }] },
      },
    });
    reply.status(201).send({ id: conv.id });
  });

  // List messages in a conversation
  app.get('/api/conversations/:id/messages', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { id } = req.params as { id: string };
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participant) return reply.status(403).send({ error: 'Not a participant' });

    const messages = await prisma.directMessage.findMany({
      where: { conversationId: id },
      include: { author: { select: AUTHOR_SELECT }, replyTo: { select: DM_REPLY_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    reply.send({ messages: messages.map((m) => decryptAuthor(m as Parameters<typeof decryptAuthor>[0])) });
  });

  // Send a message and notify the other participant
  app.post('/api/conversations/:id/messages', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { id } = req.params as { id: string };
    const body = validate(sendSchema, req.body, reply);
    if (!body) return;

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participant) return reply.status(403).send({ error: 'Not a participant' });

    // Check if conversation is closed — non-admins cannot send to a closed conversation
    const conv = await prisma.conversation.findUnique({ where: { id }, select: { closed: true } });
    if ((conv as { closed?: boolean })?.closed) {
      const actor = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
      if (!actor?.isAdmin) return reply.status(403).send({ error: 'This conversation has been closed.' });
    }

    const msg = await prisma.directMessage.create({
      data: { conversationId: id, authorId: userId, content: body.content.trim(), replyToId: body.replyToId ?? null },
      include: { author: { select: AUTHOR_SELECT }, replyTo: { select: DM_REPLY_SELECT } },
    });

    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: msg.createdAt },
    });

    const others = await prisma.conversationParticipant.findMany({
      where: { conversationId: id, userId: { not: userId } },
      select: { userId: true },
    });
    for (const o of others) {
      createNotification({
        userId: o.userId,
        type: 'direct_message',
        title: `${req.user.username} sent you a message`,
        body: body.content.slice(0, 200),
        metadata: { conversationId: id },
      }).catch(() => {});
    }

    reply.status(201).send(decryptAuthor(msg));
  });

  // Mark conversation as read
  app.patch('/api/conversations/:id/read', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { id } = req.params as { id: string };
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participant) return reply.status(403).send({ error: 'Not a participant' });
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() },
    });
    reply.send({ ok: true });
  });

  // Toggle closed state (admin only) — closes or reopens a conversation
  app.patch('/api/conversations/:id/close', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { id } = req.params as { id: string };

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    if (!actor?.isAdmin) return reply.status(403).send({ error: 'Admin access required' });

    const conv = await prisma.conversation.findUnique({ where: { id }, select: { closed: true } });
    if (!conv) return reply.status(404).send({ error: 'Conversation not found' });

    const updated = await prisma.conversation.update({
      where: { id },
      data: { closed: !(conv as { closed?: boolean }).closed },
    });
    reply.send({ ok: true, closed: (updated as { closed?: boolean }).closed ?? false });
  });

  // Total unread DM count across all conversations for a given scope
  app.get('/api/conversations/unread-count', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const isAdminChat = (req.query as { admin?: string }).admin === 'true';
    const participations = await prisma.conversationParticipant.findMany({
      where: { userId, conversation: { isAdminChat } },
      include: { conversation: { include: { messages: { orderBy: { createdAt: 'desc' } } } } },
    });
    let total = 0;
    for (const p of participations) {
      total += p.lastReadAt
        ? p.conversation.messages.filter((m) => new Date(m.createdAt) > new Date(p.lastReadAt!)).length
        : p.conversation.messages.length;
    }
    reply.send({ count: total });
  });
}
