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

// Validates the message payload for sending a DM
const sendSchema = z.object({ content: z.string().min(1).max(10000), replyToId: z.string().optional().nullable() });
// Validates the conversation creation request; isAdminChat scopes the conversation to the admin context
const createSchema = z.object({ participantId: z.string(), isAdminChat: z.boolean().optional() });
// Validates group creation — at least 2 other participants (3+ total incl. creator); a smaller
// group is just a DM, handled by the route above instead.
const createGroupSchema = z.object({
  participantIds: z.array(z.string()).min(2),
  name: z.string().max(100).optional(),
  isAdminChat: z.boolean().optional(),
});
const renameSchema = z.object({ name: z.string().min(1).max(100) });
const addParticipantsSchema = z.object({ userIds: z.array(z.string()).min(1) });

// Author fields returned with every DM message
const AUTHOR_SELECT = {
  id: true,
  username: true,
  realName: true,
  avatarEmoji: true,
  isAdmin: true,
  isFoundingAdmin: true,
};
// Compact reply-to shape embedded in threaded DM messages
const DM_REPLY_SELECT = { id: true, content: true, author: { select: AUTHOR_SELECT } };

// Decrypt realName PII on both the message author and the quoted reply-to author
function decryptAuthor<
  T extends { author: { realName: string | null }; replyTo?: { author: { realName: string | null } } | null },
>(msg: T): T {
  return {
    ...msg,
    author: { ...msg.author, realName: msg.author.realName ? safeDecryptValue(msg.author.realName) : null },
    replyTo: msg.replyTo
      ? {
          ...msg.replyTo,
          author: {
            ...msg.replyTo.author,
            realName: msg.replyTo.author.realName ? safeDecryptValue(msg.replyTo.author.realName) : null,
          },
        }
      : msg.replyTo,
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
      const others = p.conversation.participants.filter((x) => x.userId !== userId);
      const other = others[0];
      const lastMsg = p.conversation.messages[0] ?? null;
      const unread = p.lastReadAt
        ? p.conversation.messages.filter((m) => new Date(m.createdAt) > new Date(p.lastReadAt!)).length
        : p.conversation.messages.length;
      return {
        id: p.conversation.id,
        closed: (p.conversation as { closed?: boolean }).closed ?? false,
        isGroup: p.conversation.isGroup,
        name: p.conversation.name,
        other: other
          ? { ...other.user, realName: other.user.realName ? safeDecryptValue(other.user.realName) : null }
          : null,
        participants: others.map((o) => ({
          ...o.user,
          realName: o.user.realName ? safeDecryptValue(o.user.realName) : null,
        })),
        lastMessage: lastMsg
          ? decryptAuthor({
              ...lastMsg,
              author: other?.user ?? { id: '', username: '', realName: null, avatarEmoji: null },
            })
          : null,
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

  // Create a group conversation (3+ participants incl. creator). Always creates a new
  // conversation - unlike the 1:1 route above, group creation is a deliberate action that
  // shouldn't silently reuse an existing group with the same members.
  app.post('/api/conversations/group', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const body = validate(createGroupSchema, req.body, reply);
    if (!body) return;
    const { name, isAdminChat = false } = body;
    const participantIds = Array.from(new Set(body.participantIds.filter((id) => id !== userId)));
    if (participantIds.length < 2)
      return reply.status(400).send({ error: 'A group needs at least 2 other participants' });

    const users = await prisma.user.findMany({ where: { id: { in: participantIds } }, select: { id: true } });
    if (users.length !== participantIds.length) return reply.status(404).send({ error: 'One or more users not found' });

    const conv = await prisma.conversation.create({
      data: {
        isAdminChat,
        isGroup: true,
        name: name?.trim() || null,
        participants: { create: [{ userId }, ...participantIds.map((id) => ({ userId: id }))] },
      },
    });
    reply.status(201).send({ id: conv.id });
  });

  // Rename a group conversation
  app.patch('/api/conversations/:id/rename', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { id } = req.params as { id: string };
    const body = validate(renameSchema, req.body, reply);
    if (!body) return;

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participant) return reply.status(403).send({ error: 'Not a participant' });

    const conv = await prisma.conversation.findUnique({ where: { id }, select: { isGroup: true } });
    if (!conv?.isGroup) return reply.status(400).send({ error: 'Not a group conversation' });

    await prisma.conversation.update({ where: { id }, data: { name: body.name.trim() } });
    reply.send({ ok: true });
  });

  // Add participants to a group conversation
  app.post('/api/conversations/:id/participants', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { id } = req.params as { id: string };
    const body = validate(addParticipantsSchema, req.body, reply);
    if (!body) return;

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participant) return reply.status(403).send({ error: 'Not a participant' });

    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { isGroup: true, participants: { select: { userId: true } } },
    });
    if (!conv?.isGroup) return reply.status(400).send({ error: 'Not a group conversation' });

    const existingIds = new Set(conv.participants.map((p) => p.userId));
    const toAdd = Array.from(new Set(body.userIds)).filter((uid) => !existingIds.has(uid));
    if (toAdd.length === 0) return reply.send({ ok: true });

    const users = await prisma.user.findMany({ where: { id: { in: toAdd } }, select: { id: true } });
    if (users.length !== toAdd.length) return reply.status(404).send({ error: 'One or more users not found' });

    await prisma.conversationParticipant.createMany({
      data: toAdd.map((uid) => ({ conversationId: id, userId: uid })),
    });
    reply.send({ ok: true });
  });

  // Remove a participant from a group conversation (also how "Leave group" works - a participant
  // removing themselves). Blocked if it would drop the conversation below 2 remaining participants.
  app.delete('/api/conversations/:id/participants/:userId', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { id, userId: targetUserId } = req.params as { id: string; userId: string };

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participant) return reply.status(403).send({ error: 'Not a participant' });

    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { isGroup: true, participants: { select: { userId: true } } },
    });
    if (!conv?.isGroup) return reply.status(400).send({ error: 'Not a group conversation' });
    if (!conv.participants.some((p) => p.userId === targetUserId))
      return reply.status(404).send({ error: 'Not a participant of this group' });
    if (conv.participants.length <= 2)
      return reply.status(400).send({ error: 'A group needs at least 2 participants' });

    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId: id, userId: targetUserId } },
    });
    reply.send({ ok: true });
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
