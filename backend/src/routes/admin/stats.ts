/**
 * Admin stats, project listing, and deleted-project restore routes.
 * /api/admin/projects returns a denormalized list (owner, member count, task count) for the admin dashboard.
 * /api/admin/projects/deleted returns soft-deleted projects; /api/admin/products/:id/restore revives one.
 * /api/admin/stats returns aggregate counts for the last 30 days alongside all-time totals.
 */
import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../middleware/auth';
import { logAdminEvent } from '../../utils/audit';
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

  app.get('/api/admin/projects/deleted', { preHandler: requireAdmin }, async (_req, reply) => {
    const products = await prisma.product.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true, name: true, emoji: true, deletedAt: true, createdAt: true,
        ownerUser: { select: { username: true, avatarEmoji: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
        team: { select: { _count: { select: { members: true } } } },
      },
      orderBy: { deletedAt: 'desc' },
    });
    reply.send(products.map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji, deletedAt: p.deletedAt, createdAt: p.createdAt,
      ownerUsername: p.ownerUser?.username ?? null, ownerEmoji: p.ownerUser?.avatarEmoji ?? null,
      memberCount: p.team._count.members, taskCount: p._count.tasks,
    })));
  });

  app.post('/api/admin/products/:id/restore', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return reply.status(404).send({ error: 'Project not found' });
    if (!product.deletedAt) return reply.status(409).send({ error: 'Project is not deleted' });
    await prisma.product.update({ where: { id }, data: { deletedAt: null } });
    logAdminEvent('PRODUCT_RESTORED', { actorName: (req as any).user?.username, targetName: product.name, metadata: { productId: id } });
    reply.send({ ok: true });
  });

  // Hard-delete a soft-deleted project and all its data (admin only, irreversible)
  app.delete('/api/admin/products/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return reply.status(404).send({ error: 'Project not found' });
    if (!product.deletedAt) return reply.status(409).send({ error: 'Project must be soft-deleted before it can be permanently removed' });
    await prisma.product.delete({ where: { id } });
    logAdminEvent('PRODUCT_HARD_DELETED', { actorName: (req as any).user?.username, targetName: product.name, metadata: { productId: id } });
    reply.send({ ok: true });
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
