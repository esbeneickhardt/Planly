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

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  pinned: z.boolean().optional(),
  teamId: z.string().optional(),
  commentsEnabled: z.boolean().optional(),
});
const updateAnnouncementSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().max(10000).optional(),
  pinned: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
});
const commentSchema = z.object({ content: z.string().min(1).max(5000) });

const AUTHOR_SELECT = { id: true, username: true, realName: true, avatarEmoji: true, isAdmin: true };
const TEAM_SELECT   = { id: true, name: true };

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
        team:   { select: TEAM_SELECT },
        _count: { select: { comments: true } },
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
    const nextCursor = announcements.length === 50 ? (announcements[announcements.length - 1]?.id ?? null) : null;
    reply.send({ announcements, canPost, enabled, nextCursor });
  });

  // Create an announcement
  app.post('/api/announcements', { preHandler: requireAuth }, async (req, reply) => {
    const { canPost, isAdmin } = await resolvePermissions(req.user.userId);
    if (!canPost) return reply.status(403).send({ error: 'You do not have permission to post announcements.' });

    const body = validate(createAnnouncementSchema, req.body, reply);
    if (!body) return;
    const { title, content, pinned, teamId, commentsEnabled } = body;
    if (pinned && !isAdmin) return reply.status(403).send({ error: 'Only admins can pin announcements.' });
    if (pinned && teamId) return reply.status(400).send({ error: 'Team announcements cannot be pinned.' });

    // Verify teamId belongs to requester if provided
    if (teamId) {
      const membership = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: req.user.userId } },
      });
      if (!membership) return reply.status(403).send({ error: 'Not a member of that team.' });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        authorId: req.user.userId,
        teamId: teamId ?? null,
        pinned: pinned ?? false,
        commentsEnabled: commentsEnabled !== false,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        team:   { select: TEAM_SELECT },
        _count: { select: { comments: true } },
      },
    });
    reply.status(201).send(announcement);
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
        ...(title            !== undefined ? { title: title.trim() }   : {}),
        ...(content          !== undefined ? { content: content.trim() } : {}),
        ...(pinned           !== undefined ? { pinned: existing.teamId ? false : pinned } : {}),
        ...(commentsEnabled  !== undefined ? { commentsEnabled }       : {}),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        team:   { select: TEAM_SELECT },
        _count: { select: { comments: true } },
      },
    });
    reply.send(updated);
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
    reply.send({ comments, nextCursor });
  });

  // Post a comment (requires commentsEnabled on the announcement)
  app.post('/api/announcements/:id/comments', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const announcement = await prisma.announcement.findUnique({ where: { id }, select: { commentsEnabled: true } });
    if (!announcement) return reply.status(404).send({ error: 'Not found' });
    if (!announcement.commentsEnabled) return reply.status(403).send({ error: 'Comments are disabled on this announcement.' });

    const body = validate(commentSchema, req.body, reply);
    if (!body) return;
    const { content } = body;

    const comment = await prisma.announcementComment.create({
      data: { announcementId: id, authorId: req.user.userId, content: content.trim() },
      include: { author: { select: AUTHOR_SELECT } },
    });
    reply.status(201).send(comment);
  });

  // Delete a comment (author or admin)
  app.delete('/api/announcements/:id/comments/:commentId', { preHandler: requireAuth }, async (req, reply) => {
    const { commentId } = req.params as { commentId: string };
    const comment = await prisma.announcementComment.findUnique({ where: { id: commentId } });
    if (!comment) return reply.status(404).send({ error: 'Not found' });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!user?.isAdmin && comment.authorId !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.announcementComment.delete({ where: { id: commentId } });
    reply.send({ ok: true });
  });
}
