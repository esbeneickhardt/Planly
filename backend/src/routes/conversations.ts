/**
 * Direct message conversation routes.
 *
 * Conversations are scoped by `isAdminChat` so project-context DMs and
 * admin-context DMs are kept separate and never bleed into each other.
 * Pass `?admin=true` on list/create to work in the admin scope.
 *
 * Non-admin (project) conversations are additionally scoped to one project via `productId` -
 * every participant must be a member of that project's team, checked with `productMemberIds`
 * below. This keeps DMs/groups from ever reaching (or being started with) someone outside the
 * currently selected project; admin-chat conversations are the one exception and stay global,
 * since server admins are allowed to contact anyone directly.
 */
import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth, type AuthPayload } from '../middleware/auth';
import { requireProductWritable } from '../utils/product-guard';
import { validate } from '../utils/validate';
import { createNotification } from '../utils/notifications';
import { safeDecryptValue } from '../utils/crypto';
import { sendEmail, directMessageEmail } from '../utils/email';
import { config } from '../config/env';

// Validates the message payload for sending a DM
const sendSchema = z.object({ content: z.string().min(1).max(10000), replyToId: z.string().optional().nullable() });
// Validates the conversation creation request; isAdminChat scopes the conversation to the admin
// context (unscoped from any project - server admins can contact anyone directly). Non-admin
// conversations must instead carry the project they belong to, checked in the handler below.
const createSchema = z.object({ participantId: z.string(), isAdminChat: z.boolean().optional(), productId: z.string().optional() });
// Validates group creation - at least 2 other participants (3+ total incl. creator); a smaller
// group is just a DM, handled by the route above instead.
const createGroupSchema = z.object({
  participantIds: z.array(z.string()).min(2),
  name: z.string().max(100).optional(),
  isAdminChat: z.boolean().optional(),
  productId: z.string().optional(),
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

// Returns the subset of `userIds` who are members of `productId`'s team - the same membership
// definition routes/products.ts relies on when creating a product (the creator must already be a
// team member there, so team membership is always the complete, authoritative set including the
// owner). Used to keep non-admin conversations (DMs/groups) from ever including someone who isn't
// actually part of the project the conversation is scoped to.
async function productMemberIds(productId: string, userIds: string[]): Promise<Set<string>> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { team: { select: { members: { where: { userId: { in: userIds } }, select: { userId: true } } } } },
  });
  return new Set(product?.team.members.map((m) => m.userId) ?? []);
}

// `isAdminChat` on every route below is a client-supplied flag (the "admin mode" toggle in the
// chat panel), not something inherently trustworthy on its own - without this check, any regular
// (non-admin) user could simply send isAdminChat: true and skip project scoping entirely, reaching
// anyone in the system. This re-verifies isAdmin against the DB server-side, exactly like
// middleware/auth.ts's requireAdmin does, whenever isAdminChat is claimed.
async function isRealAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return !!user?.isAdmin;
}

// Rejects when a scoped PAT/App token tries to reach a conversation outside its own project - or
// any admin-chat conversation at all, since those have no productId a scope could ever match.
// Mirrors requireScopeMatch in product-guard.ts, but that helper takes an already-known productId;
// here it's resolved from the conversation row first (null for admin-chat), hence a local variant.
function requireConvScopeMatch(convProductId: string | null, user: AuthPayload, reply: FastifyReply): boolean {
  if (!user.scopedProductId) return true;
  if (convProductId !== user.scopedProductId) {
    reply.status(403).send({ error: 'Token is not authorized for this conversation' });
    return false;
  }
  return true;
}

// Returns unread DirectMessage counts per conversation for `userId`, scoped to `conversationIds` -
// one SQL aggregate instead of one `directMessage.count()` (or worse, a full message fetch) per
// conversation. "Unread" is relative to each conversation's own ConversationParticipant.lastReadAt
// for this user, which a plain Prisma `groupBy` can't express (the cutoff varies per row), hence
// the raw query.
async function unreadCountsByConversation(userId: string, conversationIds: string[]): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ conversationId: string; count: bigint }[]>`
    SELECT dm."conversationId", COUNT(*) as count
    FROM "DirectMessage" dm
    JOIN "ConversationParticipant" cp ON cp."conversationId" = dm."conversationId" AND cp."userId" = ${userId}
    WHERE dm."conversationId" = ANY(${conversationIds})
      AND (cp."lastReadAt" IS NULL OR dm."createdAt" > cp."lastReadAt")
    GROUP BY dm."conversationId"
  `;
  return new Map(rows.map((r) => [r.conversationId, Number(r.count)]));
}

export async function conversationRoutes(app: FastifyInstance) {
  // List conversations scoped to the requested context (?admin=true for admin chat, otherwise
  // ?productId= is required - non-admin chat is always scoped to one project, never global).
  app.get('/api/conversations', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { admin, productId } = req.query as { admin?: string; productId?: string };
    const isAdminChat = admin === 'true';
    if (!isAdminChat && !productId) return reply.status(400).send({ error: 'productId is required' });
    if (isAdminChat && !(await isRealAdmin(userId))) return reply.status(403).send({ error: 'Admin access required' });
    if (!requireConvScopeMatch(isAdminChat ? null : (productId ?? null), req.user, reply)) return;

    const participations = await prisma.conversationParticipant.findMany({
      where: { userId, conversation: { isAdminChat, ...(isAdminChat ? {} : { productId }) } },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: AUTHOR_SELECT } } },
            // take: 1 here is only ever used for the preview snippet below - the unread badge is
            // computed separately via its own count() query, since capping at 1 message would
            // otherwise cap every conversation's unread count at 0-or-1 regardless of how many
            // messages actually arrived.
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    // One batched aggregate for every conversation's unread count instead of a directMessage.count()
    // per conversation inside the map below.
    const unreadByConv = await unreadCountsByConversation(
      userId,
      participations.map((p) => p.conversation.id),
    );

    const result = participations.map((p) => {
      const others = p.conversation.participants.filter((x) => x.userId !== userId);
      const other = others[0];
      const lastMsg = p.conversation.messages[0] ?? null;
      // Attribute the preview to whoever actually wrote it (could be the requesting user, or
      // any participant in a group) - not always "the other person", which silently misattributes
      // the message whenever the requesting user sent the last one.
      const lastMsgAuthor = lastMsg
        ? p.conversation.participants.find((x) => x.user.id === lastMsg.authorId)?.user
        : null;
      return {
        id: p.conversation.id,
        closed: p.conversation.closed,
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
              author: lastMsgAuthor ?? { id: '', username: '', realName: null, avatarEmoji: null },
            })
          : null,
        unread: unreadByConv.get(p.conversation.id) ?? 0,
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
    const { participantId, isAdminChat = false, productId } = body;
    if (participantId === userId) return reply.status(400).send({ error: 'Cannot start a conversation with yourself' });

    const other = await prisma.user.findUnique({ where: { id: participantId }, select: { id: true } });
    if (!other) return reply.status(404).send({ error: 'User not found' });
    if (!requireConvScopeMatch(isAdminChat ? null : (productId ?? null), req.user, reply)) return;

    // Non-admin DMs are always scoped to a project - both the requester and the target must
    // actually be members of it, otherwise chat would let you reach people outside the project.
    if (!isAdminChat) {
      if (!productId) return reply.status(400).send({ error: 'productId is required' });
      const members = await productMemberIds(productId, [userId, participantId]);
      if (!members.has(userId)) return reply.status(403).send({ error: 'Forbidden' });
      if (!members.has(participantId))
        return reply.status(403).send({ error: 'That user is not a member of this project' });
    } else if (!(await isRealAdmin(userId))) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    // Look for an existing 1:1 conversation with the same scope between these two users - must
    // exclude groups, otherwise "start a DM with this person" can silently resolve to a group
    // conversation both users happen to also share, showing that group's whole multi-author
    // thread under a header that only names the one person that was clicked. Also scoped to the
    // same project - the same two people can have an independent DM thread per project, since a
    // conversation from one project shouldn't surface (or let its content leak) inside another.
    const existing = await prisma.conversationParticipant.findFirst({
      where: {
        userId,
        conversation: {
          isAdminChat,
          isGroup: false,
          participants: { some: { userId: participantId } },
          ...(isAdminChat ? {} : { productId }),
        },
      },
      select: { conversationId: true },
    });
    if (existing) return reply.send({ id: existing.conversationId });

    const conv = await prisma.conversation.create({
      data: {
        isAdminChat,
        productId: isAdminChat ? null : productId,
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
    const { name, isAdminChat = false, productId } = body;
    const participantIds = Array.from(new Set(body.participantIds.filter((id) => id !== userId)));
    if (participantIds.length < 2)
      return reply.status(400).send({ error: 'A group needs at least 2 other participants' });

    const users = await prisma.user.findMany({ where: { id: { in: participantIds } }, select: { id: true } });
    if (users.length !== participantIds.length) return reply.status(404).send({ error: 'One or more users not found' });
    if (!requireConvScopeMatch(isAdminChat ? null : (productId ?? null), req.user, reply)) return;

    // Non-admin groups are always scoped to a project - the creator and every invited member
    // must actually belong to it.
    if (!isAdminChat) {
      if (!productId) return reply.status(400).send({ error: 'productId is required' });
      const members = await productMemberIds(productId, [userId, ...participantIds]);
      if (!members.has(userId)) return reply.status(403).send({ error: 'Forbidden' });
      const outsiders = participantIds.filter((id) => !members.has(id));
      if (outsiders.length > 0)
        return reply.status(403).send({ error: 'One or more users are not members of this project' });
    } else if (!(await isRealAdmin(userId))) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const conv = await prisma.conversation.create({
      data: {
        isAdminChat,
        productId: isAdminChat ? null : productId,
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

    const conv = await prisma.conversation.findUnique({ where: { id }, select: { isGroup: true, productId: true } });
    if (!conv?.isGroup) return reply.status(400).send({ error: 'Not a group conversation' });
    if (!requireConvScopeMatch(conv.productId, req.user, reply)) return;

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
      select: { isGroup: true, productId: true, participants: { select: { userId: true } } },
    });
    if (!conv?.isGroup) return reply.status(400).send({ error: 'Not a group conversation' });
    if (!requireConvScopeMatch(conv.productId, req.user, reply)) return;

    const existingIds = new Set(conv.participants.map((p) => p.userId));
    const toAdd = Array.from(new Set(body.userIds)).filter((uid) => !existingIds.has(uid));
    if (toAdd.length === 0) return reply.send({ ok: true });

    const users = await prisma.user.findMany({ where: { id: { in: toAdd } }, select: { id: true } });
    if (users.length !== toAdd.length) return reply.status(404).send({ error: 'One or more users not found' });

    // A project-scoped group can only ever grow with members of that same project.
    if (conv.productId) {
      const members = await productMemberIds(conv.productId, toAdd);
      const outsiders = toAdd.filter((uid) => !members.has(uid));
      if (outsiders.length > 0)
        return reply.status(403).send({ error: 'One or more users are not members of this project' });
    }

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
      select: { isGroup: true, productId: true, participants: { select: { userId: true } } },
    });
    if (!conv?.isGroup) return reply.status(400).send({ error: 'Not a group conversation' });
    if (!requireConvScopeMatch(conv.productId, req.user, reply)) return;
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
    // Only look up the conversation's own productId when a scoped token is asking - free for the
    // much more common cookie-session case, which never needs this extra query.
    if (req.user.scopedProductId) {
      const conv = await prisma.conversation.findUnique({ where: { id }, select: { productId: true } });
      if (!requireConvScopeMatch(conv?.productId ?? null, req.user, reply)) return;
    }

    const messages = await prisma.directMessage.findMany({
      where: { conversationId: id },
      include: { author: { select: AUTHOR_SELECT }, replyTo: { select: DM_REPLY_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    reply.send({ messages: messages.map((m) => decryptAuthor(m)) });
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

    // Check if conversation is closed - non-admins cannot send to a closed conversation
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { closed: true, isGroup: true, name: true, productId: true },
    });
    if (conv?.closed) {
      const actor = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
      if (!actor?.isAdmin) return reply.status(403).send({ error: 'This conversation has been closed.' });
    }
    if (!requireConvScopeMatch(conv?.productId ?? null, req.user, reply)) return;
    // Project-scoped conversations respect the project's own lockdown rule; admin-chat
    // conversations have no productId and aren't affected by any project's status.
    const convProductId = conv?.productId;
    if (convProductId && !(await requireProductWritable(convProductId, req.user, reply))) return;

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
      select: { userId: true, user: { select: { email: true, notificationPreferences: true } } },
    });
    const groupContext = conv?.isGroup ? (conv.name ?? 'group chat') : undefined;
    for (const o of others) {
      createNotification({
        userId: o.userId,
        type: 'direct_message',
        title: `${req.user.username} sent you a message`,
        body: body.content.slice(0, 200),
        metadata: { conversationId: id },
      }).catch(() => {});

      // Email notification (off by default, opt-in via emailDirectMessages pref) - mirrors the
      // @mention email-gating pattern in routes/messages.ts.
      const prefs = (o.user.notificationPreferences as Record<string, boolean> | null) ?? {};
      if (prefs.emailDirectMessages === true) {
        sendEmail({
          to: o.user.email,
          subject: `${req.user.username} sent you a message on Planly`,
          html: directMessageEmail(req.user.username, body.content.slice(0, 200), config.appUrl, groupContext),
        }).catch((err) => {
          req.log.error({ err }, '[conversations] direct message email failed');
        });
      }
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
    if (req.user.scopedProductId) {
      const conv = await prisma.conversation.findUnique({ where: { id }, select: { productId: true } });
      if (!requireConvScopeMatch(conv?.productId ?? null, req.user, reply)) return;
    }
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() },
    });
    reply.send({ ok: true });
  });

  // Toggle closed state (admin only) - closes or reopens a conversation
  app.patch('/api/conversations/:id/close', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { id } = req.params as { id: string };
    // An admin moderation action, unrelated to any single project - a scoped token should never
    // be able to perform it regardless of which project it's scoped to.
    if (req.user.scopedProductId)
      return reply.status(403).send({ error: 'This token is not authorized for admin actions' });

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    if (!actor?.isAdmin) return reply.status(403).send({ error: 'Admin access required' });

    const conv = await prisma.conversation.findUnique({ where: { id }, select: { closed: true } });
    if (!conv) return reply.status(404).send({ error: 'Conversation not found' });

    const updated = await prisma.conversation.update({
      where: { id },
      data: { closed: !conv.closed },
    });
    reply.send({ ok: true, closed: updated.closed });
  });

  // Total unread DM count across all conversations for a given scope
  app.get('/api/conversations/unread-count', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const { admin, productId } = req.query as { admin?: string; productId?: string };
    const isAdminChat = admin === 'true';
    if (!isAdminChat && !productId) return reply.status(400).send({ error: 'productId is required' });
    if (isAdminChat && !(await isRealAdmin(userId))) return reply.status(403).send({ error: 'Admin access required' });
    if (!requireConvScopeMatch(isAdminChat ? null : (productId ?? null), req.user, reply)) return;

    // Resolve which conversations are in scope first (id only - no message content), then count
    // unread messages for all of them in a single SQL aggregate instead of fetching every
    // message's full content for every conversation just to count them in JS.
    const participations = await prisma.conversationParticipant.findMany({
      where: { userId, conversation: { isAdminChat, ...(isAdminChat ? {} : { productId }) } },
      select: { conversationId: true },
    });
    const unreadByConv = await unreadCountsByConversation(
      userId,
      participations.map((p) => p.conversationId),
    );
    const total = [...unreadByConv.values()].reduce((sum, n) => sum + n, 0);
    reply.send({ count: total });
  });
}
