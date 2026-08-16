/**
 * Announcement routes - server-wide and team-scoped pinned announcements.
 *
 * Announcements support markdown content and can be pinned to appear at the
 * top of views for all users. Admins can post server-wide announcements;
 * co-owners can post team-scoped announcements. Announcements can be given an
 * expiry date after which they are automatically hidden.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { getServerConfig } from '../utils/server-config';
import { validate } from '../utils/validate';
import { safeDecryptValue } from '../utils/crypto';
import { broadcastAll } from '../realtime/manager';
import { resolveProjectRoleClaims } from '../utils/product-guard';

// Role badge values a poster can claim; each must be verified against actual permissions at write time
const VALID_ROLES = ['Server Owner', 'Server Admin', 'Project Owner', 'Project Co-Owner'] as const;
// Payload for creating a new announcement; pinned and commentsEnabled default to false/true respectively
const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  pinned: z.boolean().optional(),
  teamId: z.string().optional(),
  commentsEnabled: z.boolean().optional(),
  postedAsRole: z.enum(VALID_ROLES).nullable().optional(),
});
// Partial update payload — all fields optional so callers can patch just what changed
const updateAnnouncementSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().max(10000).optional(),
  pinned: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
});
// Payload for posting a comment on an announcement
const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  postedAsRole: z.enum(VALID_ROLES).nullable().optional(),
});

// Author fields included in every announcement and comment response
const AUTHOR_SELECT = {
  id: true,
  username: true,
  realName: true,
  avatarEmoji: true,
  isAdmin: true,
  isFoundingAdmin: true,
};
// Team fields included alongside team-scoped announcements
const TEAM_SELECT = { id: true, name: true };

// Decrypt realName PII on the embedded author object before sending to clients
function decryptAuthor<T extends { author: { realName: string | null } | null }>(obj: T): T {
  if (!obj.author) return obj;
  return {
    ...obj,
    author: { ...obj.author, realName: obj.author.realName ? safeDecryptValue(obj.author.realName) : null },
  };
}

// Resolve post/manage permissions by checking admin status and server config
async function resolvePermissions(userId: string): Promise<{ isAdmin: boolean; canPost: boolean; enabled: boolean }> {
  const [cfg, user] = await Promise.all([
    getServerConfig(),
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
  ]);
  const isAdmin = user?.isAdmin ?? false;
  if (isAdmin) return { isAdmin, canPost: true, enabled: cfg.announcementsEnabled };

  // Non-admins: check role setting
  if (!cfg.announcementsEnabled) return { isAdmin, canPost: false, enabled: false };

  if (cfg.announcementPostRole === 'all') return { isAdmin, canPost: true, enabled: true };

  if (cfg.announcementPostRole === 'admin_and_owners') {
    const ownsProduct = await prisma.product.count({ where: { ownerId: userId, deletedAt: null } });
    return { isAdmin, canPost: ownsProduct > 0, enabled: true };
  }

  return { isAdmin, canPost: false, enabled: true };
}

export async function announcementRoutes(app: FastifyInstance) {
  // List all announcements with comment counts. Always returns data so admins can manage
  // the feature before enabling it for members. Response includes canPost + enabled flags.
  //
  // INTENTIONAL: All announcements - including those tagged with a specific teamId - are
  // visible to every authenticated user in the organisation. Announcements are an org-wide
  // broadcast channel. They are NOT a team-private communication tool; use product chat for
  // that. This means a team announcement reaches the whole organisation by design.
  app.get('/api/announcements', { preHandler: requireAuth }, async (req, reply) => {
    const { canPost, enabled } = await resolvePermissions(req.user.userId);
    if (!enabled && !canPost) return reply.send({ announcements: [], canPost: false, enabled: false });

    const { cursor } = req.query as { cursor?: string };
    const announcements = await prisma.announcement.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: 50,
      include: {
        author: { select: AUTHOR_SELECT },
        team: { select: TEAM_SELECT },
        _count: { select: { comments: true } },
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
    const nextCursor = announcements.length === 50 ? (announcements[announcements.length - 1]?.id ?? null) : null;
    reply.send({ announcements: announcements.map(decryptAuthor), canPost, enabled, nextCursor });
  });

  // Create an announcement
  app.post('/api/announcements', { preHandler: requireAuth }, async (req, reply) => {
    const { canPost, isAdmin } = await resolvePermissions(req.user.userId);
    if (!canPost) return reply.status(403).send({ error: 'You do not have permission to post announcements.' });

    const body = validate(createAnnouncementSchema, req.body, reply);
    if (!body) return;
    const { title, content, pinned, teamId, commentsEnabled, postedAsRole: rawRole } = body;
    if (pinned && !isAdmin) return reply.status(403).send({ error: 'Only admins can pin announcements.' });
    if (pinned && teamId) return reply.status(400).send({ error: 'Team announcements cannot be pinned.' });

    // Verify teamId belongs to requester if provided; reused below for the Project Co-Owner
    // role-claim check so we don't look up the same team-membership row twice.
    const teamMembership = teamId
      ? await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: req.user.userId } } })
      : null;
    if (teamId && !teamMembership) return reply.status(403).send({ error: 'Not a member of that team.' });

    // Validate claimed role against user's actual permissions to prevent spoofing
    const sender = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isAdmin: true, isFoundingAdmin: true },
    });
    let postedAsRole: string | null = rawRole ?? null;
    if (postedAsRole === 'Server Owner' && !sender?.isFoundingAdmin) postedAsRole = null;
    if (postedAsRole === 'Server Admin' && !sender?.isAdmin) postedAsRole = null;
    // Project Owner/Co-Owner are only meaningful relative to a specific team (co-ownership is a
    // per-team TeamRole - see product-guard.ts's requireTabWrite doc comment) - a server-wide
    // announcement (no teamId) has nothing to verify either claim against, so both are rejected.
    if (postedAsRole === 'Project Co-Owner' && teamMembership?.role !== 'co_owner') postedAsRole = null;
    if (postedAsRole === 'Project Owner') {
      const ownsProduct = teamId
        ? await prisma.product.count({ where: { teamId, ownerId: req.user.userId, deletedAt: null } })
        : 0;
      if (ownsProduct === 0) postedAsRole = null;
    }

    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        authorId: req.user.userId,
        teamId: teamId ?? null,
        pinned: pinned ?? false,
        commentsEnabled: commentsEnabled !== false,
        postedAsRole,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        team: { select: TEAM_SELECT },
        _count: { select: { comments: true } },
      },
    });
    reply.status(201).send(decryptAuthor(announcement));
  });

  // Edit an announcement (author or admin)
  app.patch('/api/announcements/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = validate(updateAnnouncementSchema, req.body, reply);
    if (!body) return;
    const { title, content, pinned, commentsEnabled } = body;

    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!user?.isAdmin && existing.authorId !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });

    // Only admins can pin; team announcements cannot be pinned at all
    if (pinned && !user?.isAdmin) return reply.status(403).send({ error: 'Only admins can pin announcements.' });
    if (pinned && existing.teamId) return reply.status(400).send({ error: 'Team announcements cannot be pinned.' });

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(content !== undefined ? { content: content.trim() } : {}),
        ...(pinned !== undefined ? { pinned: existing.teamId ? false : pinned } : {}),
        ...(commentsEnabled !== undefined ? { commentsEnabled } : {}),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        team: { select: TEAM_SELECT },
        _count: { select: { comments: true } },
      },
    });
    reply.send(decryptAuthor(updated));
  });

  // Delete an announcement (author or admin)
  app.delete('/api/announcements/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!user?.isAdmin && existing.authorId !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.announcement.delete({ where: { id } });
    reply.send({ ok: true });
  });

  // ── Comments ────────────────────────────────────────────────────────────────

  // List comments on an announcement
  app.get('/api/announcements/:id/comments', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const announcement = await prisma.announcement.findUnique({ where: { id }, select: { commentsEnabled: true } });
    if (!announcement) return reply.status(404).send({ error: 'Not found' });

    const { cursor } = req.query as { cursor?: string };
    const comments = await prisma.announcementComment.findMany({
      where: { announcementId: id },
      include: { author: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: 100,
    });
    const nextCursor = comments.length === 100 ? (comments[comments.length - 1]?.id ?? null) : null;
    reply.send({ comments: comments.map(decryptAuthor), nextCursor });
  });

  // Post a comment (requires commentsEnabled on the announcement)
  app.post('/api/announcements/:id/comments', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { commentsEnabled: true, teamId: true },
    });
    if (!announcement) return reply.status(404).send({ error: 'Not found' });
    if (!announcement.commentsEnabled)
      return reply.status(403).send({ error: 'Comments are disabled on this announcement.' });

    const body = validate(commentSchema, req.body, reply);
    if (!body) return;
    const { content, postedAsRole: rawRole } = body;

    // Validate role claims against actual permissions
    const [sender, roleClaims] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { isAdmin: true, isFoundingAdmin: true },
      }),
      // Project Owner/Co-Owner are only meaningful relative to the announcement's team, if any -
      // see resolveProjectRoleClaims's doc comment for the no-team-in-scope (server-wide
      // announcement) case, which always comes back false for both.
      resolveProjectRoleClaims(req.user.userId, { teamId: announcement.teamId ?? undefined }),
    ]);
    let postedAsRole: string | null = rawRole ?? null;
    if (postedAsRole === 'Server Owner' && !sender?.isFoundingAdmin) postedAsRole = null;
    if (postedAsRole === 'Server Admin' && !sender?.isAdmin) postedAsRole = null;
    if (postedAsRole === 'Project Owner' && !roleClaims.isProjectOwner) postedAsRole = null;
    if (postedAsRole === 'Project Co-Owner' && !roleClaims.isProjectCoOwner) postedAsRole = null;

    const comment = await prisma.announcementComment.create({
      data: { announcementId: id, authorId: req.user.userId, content: content.trim(), postedAsRole },
      include: { author: { select: AUTHOR_SELECT } },
    });
    const decrypted = decryptAuthor(comment);
    broadcastAll('announcement.commented', { announcementId: id, comment: decrypted });
    reply.status(201).send(decrypted);
  });

  // Delete a comment (author or admin)
  app.delete('/api/announcements/:id/comments/:commentId', { preHandler: requireAuth }, async (req, reply) => {
    const { commentId } = req.params as { commentId: string };
    const comment = await prisma.announcementComment.findUnique({ where: { id: commentId } });
    if (!comment) return reply.status(404).send({ error: 'Not found' });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!user?.isAdmin && comment.authorId !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    const { announcementId } = comment;
    await prisma.announcementComment.delete({ where: { id: commentId } });
    broadcastAll('announcement.comment.deleted', { announcementId, commentId });
    reply.send({ ok: true });
  });
}
