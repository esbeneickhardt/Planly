import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { getServerConfig } from '../utils/server-config';

const AUTHOR_SELECT = { id: true, username: true, realName: true, avatarEmoji: true, isAdmin: true };
const TEAM_SELECT   = { id: true, name: true };

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
  app.get('/api/announcements', { preHandler: requireAuth }, async (req, reply) => {
    const { canPost, enabled } = await resolvePermissions(req.user.userId);
    if (!enabled && !canPost) return reply.send({ announcements: [], canPost: false, enabled: false });

    const announcements = await prisma.announcement.findMany({
      include: {
        author: { select: AUTHOR_SELECT },
        team:   { select: TEAM_SELECT },
        _count: { select: { comments: true } },
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
    reply.send({ announcements, canPost, enabled });
  });

  // Create an announcement
  app.post('/api/announcements', { preHandler: requireAuth }, async (req, reply) => {
    const { canPost } = await resolvePermissions(req.user.userId);
    if (!canPost) return reply.status(403).send({ error: 'You do not have permission to post announcements.' });

    const { title, content, pinned, teamId, commentsEnabled } = req.body as {
      title: string; content: string; pinned?: boolean; teamId?: string; commentsEnabled?: boolean;
    };
    if (!title?.trim()) return reply.status(400).send({ error: 'title required' });
    if (!content?.trim()) return reply.status(400).send({ error: 'content required' });
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
    const { title, content, pinned, commentsEnabled } = req.body as {
      title?: string; content?: string; pinned?: boolean; commentsEnabled?: boolean;
    };

    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!user?.isAdmin && existing.authorId !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });

    // Cannot pin a team announcement
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

  app.get('/api/announcements/:id/comments', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const announcement = await prisma.announcement.findUnique({ where: { id }, select: { commentsEnabled: true } });
    if (!announcement) return reply.status(404).send({ error: 'Not found' });

    const comments = await prisma.announcementComment.findMany({
      where: { announcementId: id },
      include: { author: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    reply.send(comments);
  });

  app.post('/api/announcements/:id/comments', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const announcement = await prisma.announcement.findUnique({ where: { id }, select: { commentsEnabled: true } });
    if (!announcement) return reply.status(404).send({ error: 'Not found' });
    if (!announcement.commentsEnabled) return reply.status(403).send({ error: 'Comments are disabled on this announcement.' });

    const { content } = req.body as { content: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content required' });

    const comment = await prisma.announcementComment.create({
      data: { announcementId: id, authorId: req.user.userId, content: content.trim() },
      include: { author: { select: AUTHOR_SELECT } },
    });
    reply.status(201).send(comment);
  });

  app.delete('/api/announcements/:id/comments/:commentId', { preHandler: requireAuth }, async (req, reply) => {
    const { commentId } = req.params as { id: string; commentId: string };
    const comment = await prisma.announcementComment.findUnique({ where: { id: commentId } });
    if (!comment) return reply.status(404).send({ error: 'Not found' });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!user?.isAdmin && comment.authorId !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.announcementComment.delete({ where: { id: commentId } });
    reply.send({ ok: true });
  });
}
