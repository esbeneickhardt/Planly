/**
 * Admin stats and project listing routes.
 * /api/admin/projects returns a denormalized list (owner, member count, task count) for the admin dashboard.
 * /api/admin/stats returns aggregate counts for the last 30 days alongside all-time totals.
 */
import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../middleware/auth';
import prisma from '../../db/client';

export async function adminStatsRoutes(app: FastifyInstance) {
  app.get('/api/admin/projects', { preHandler: requireAdmin }, async (_req, reply) => {
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, emoji: true, deadline: true, createdAt: true,
        ownerUser: { select: { username: true, avatarEmoji: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
        team: { select: { _count: { select: { members: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(products.map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji, deadline: p.deadline, createdAt: p.createdAt,
      ownerUsername: p.ownerUser?.username ?? null, ownerEmoji: p.ownerUser?.avatarEmoji ?? null,
      memberCount: p.team._count.members, taskCount: p._count.tasks,
    })));
  });

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
