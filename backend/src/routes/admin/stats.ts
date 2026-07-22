/**
 * Admin stats, project listing, deleted-project restore, and project-chat proxy routes.
 * /api/admin/projects returns a denormalized list (owner, member count, task count) for the admin dashboard.
 * /api/admin/projects/deleted returns soft-deleted projects; /api/admin/products/:id/restore revives one.
 * /api/admin/stats returns aggregate counts for the last 30 days alongside all-time totals.
 * /api/admin/products/:id/messages lets admins read and write into any project's chat.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth';
import { logAdminEvent } from '../../utils/audit';
import prisma from '../../db/client';
import { decryptMessageAuthor } from '../../utils/crypto';
import { broadcast } from '../../realtime/manager';

// Author fields included in admin-proxied project chat messages
const ADMIN_MSG_AUTHOR_SELECT = {
  id: true,
  username: true,
  realName: true,
  avatarEmoji: true,
  isAdmin: true,
  isFoundingAdmin: true,
};
// Role badge values an admin can claim when posting into a project chat via the admin panel
const VALID_ROLES = ['Server Owner', 'Server Admin', 'Project Owner', 'Project Co-Owner'] as const;
// Message payload for the admin-proxy post-to-project-chat endpoint
const adminMsgSendSchema = z.object({
  content: z.string().min(1).max(10000),
  postedAsRole: z.enum(VALID_ROLES).nullable().optional(),
});

export async function adminStatsRoutes(app: FastifyInstance) {
  // List all active projects with owner details, member count, and task count for the admin dashboard
  app.get('/api/admin/projects', { preHandler: requireAdmin }, async (_req, reply) => {
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        emoji: true,
        deadline: true,
        createdAt: true,
        ownerId: true,
        teamId: true,
        ownerUser: { select: { username: true, avatarEmoji: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
        team: { select: { _count: { select: { members: true } }, members: { select: { userId: true, role: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        deadline: p.deadline,
        createdAt: p.createdAt,
        ownerId: p.ownerId ?? null,
        teamId: p.teamId,
        ownerUsername: p.ownerUser?.username ?? null,
        ownerEmoji: p.ownerUser?.avatarEmoji ?? null,
        memberCount: p.team._count.members,
        taskCount: p._count.tasks,
        teamMembers: p.team.members,
      })),
    );
  });

  // List soft-deleted projects so admins can review before hard-deleting or restoring
  app.get('/api/admin/projects/deleted', { preHandler: requireAdmin }, async (_req, reply) => {
    const products = await prisma.product.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        emoji: true,
        deletedAt: true,
        createdAt: true,
        ownerUser: { select: { username: true, avatarEmoji: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
        team: { select: { _count: { select: { members: true } } } },
      },
      orderBy: { deletedAt: 'desc' },
    });
    reply.send(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        deletedAt: p.deletedAt,
        createdAt: p.createdAt,
        ownerUsername: p.ownerUser?.username ?? null,
        ownerEmoji: p.ownerUser?.avatarEmoji ?? null,
        memberCount: p.team._count.members,
        taskCount: p._count.tasks,
      })),
    );
  });

  // Restore a soft-deleted project by clearing its deletedAt timestamp
  app.post('/api/admin/products/:id/restore', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return reply.status(404).send({ error: 'Project not found' });
    if (!product.deletedAt) return reply.status(409).send({ error: 'Project is not deleted' });
    await prisma.product.update({ where: { id }, data: { deletedAt: null } });
    logAdminEvent('PRODUCT_RESTORED', {
      actorName: (req as any).user?.username,
      targetName: product.name,
      metadata: { productId: id },
    });
    reply.send({ ok: true });
  });

  // Hard-delete a soft-deleted project and all its data (admin only, irreversible)
  app.delete('/api/admin/products/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return reply.status(404).send({ error: 'Project not found' });
    if (!product.deletedAt)
      return reply.status(409).send({ error: 'Project must be soft-deleted before it can be permanently removed' });
    await prisma.product.delete({ where: { id } });
    logAdminEvent('PRODUCT_HARD_DELETED', {
      actorName: (req as any).user?.username,
      targetName: product.name,
      metadata: { productId: id },
    });
    reply.send({ ok: true });
  });

  // Admin can read any project chat
  app.get('/api/admin/products/:id/messages', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const messages = await prisma.message.findMany({
      where: { productId: id, taskId: null },
      include: { author: { select: ADMIN_MSG_AUTHOR_SELECT }, reactions: true },
      orderBy: { createdAt: 'asc' },
    });
    reply.send({ messages: messages.map(decryptMessageAuthor) });
  });

  // Admin can post into any project chat
  app.post('/api/admin/products/:id/messages', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (() => {
      try {
        return adminMsgSendSchema.parse(req.body);
      } catch {
        return null;
      }
    })();
    if (!body) return reply.status(400).send({ error: 'Invalid body' });
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const sender = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isAdmin: true, isFoundingAdmin: true },
    });
    let postedAsRole: string | null = body.postedAsRole ?? null;
    if (postedAsRole === 'Server Owner' && !sender?.isFoundingAdmin) postedAsRole = null;
    if (postedAsRole === 'Server Admin' && !sender?.isAdmin) postedAsRole = null;
    const msg = await prisma.message.create({
      data: {
        productId: id,
        taskId: null,
        authorId: req.user.userId,
        content: body.content.trim(),
        attachments: [],
        postedAsRole,
      },
      include: { author: { select: ADMIN_MSG_AUTHOR_SELECT }, reactions: true },
    });
    const decryptedMsg = decryptMessageAuthor(msg);
    broadcast(id, 'message.created', decryptedMsg);
    reply.status(201).send(decryptedMsg);
  });

  // Return server-wide aggregate stats: all-time totals plus last-30-day new counts
  app.get('/api/admin/stats', { preHandler: requireAdmin }, async (_req, reply) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Run all six counts in parallel to minimise latency
    const [userCount, projectCount, taskCount, messageCount, newUsers, newProjects] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.task.count({ where: { deletedAt: null } }),
      prisma.message.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.product.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
    ]);
    reply.send({ userCount, projectCount, taskCount, messageCount, newUsers, newProjects });
  });
}
