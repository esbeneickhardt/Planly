import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/analytics', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;

    // If analytics is disabled, only the product owner or team co-owner may view it
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { analyticsEnabled: true, ownerId: true, teamId: true },
    });
    if (!product) return reply.status(404).send({ error: 'Product not found' });
    if (!product.analyticsEnabled) {
      const isOwner = product.ownerId === req.user.userId;
      if (!isOwner) {
        const membership = await prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId: product.teamId, userId: req.user.userId } },
          select: { role: true },
        });
        if (membership?.role !== 'co_owner') {
          return reply.status(403).send({ error: 'Analytics is disabled for this project' });
        }
      }
    }

    const now = new Date();
    const since90 = new Date(now);
    since90.setDate(since90.getDate() - 89);
    since90.setHours(0, 0, 0, 0);

    // Tasks completed in last 90 days
    const completedRecent = await prisma.task.findMany({
      where: { productId, deletedAt: null, completedAt: { gte: since90 } },
      select: { completedAt: true, completedBy: true },
    });

    // Day buckets
    const dayMap = new Map<string, number>();
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const t of completedRecent) {
      if (!t.completedAt) continue;
      const key = t.completedAt.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const tasksByDay = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));

    // Average cycle time
    const cycleTimeTasks = await prisma.task.findMany({
      where: { productId, deletedAt: null, completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
    });
    let cycleTimeAvgDays: number | null = null;
    if (cycleTimeTasks.length > 0) {
      const totalMs = cycleTimeTasks.reduce((sum, t) => sum + (t.completedAt!.getTime() - t.createdAt.getTime()), 0);
      cycleTimeAvgDays = Math.round((totalMs / cycleTimeTasks.length / 86400000) * 10) / 10;
    }

    // Status breakdown (active tasks only)
    const statusGroups = await prisma.task.groupBy({
      by: ['status'],
      where: { productId, deletedAt: null, completedAt: null },
      _count: { _all: true },
    });
    const statusBreakdown = statusGroups.map((g) => ({ status: g.status, count: g._count._all }));

    // Sprint velocity: tasks completed per sprint
    const sprints = await prisma.sprint.findMany({
      where: { productId },
      select: { id: true, name: true, startDate: true, endDate: true, color: true },
      orderBy: { startDate: 'asc' },
    });
    const sprintVelocity = await Promise.all(sprints.map(async (s) => {
      const count = await prisma.task.count({
        where: {
          productId,
          deletedAt: null,
          completedAt: { gte: s.startDate, lte: s.endDate },
        },
      });
      return { sprintId: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, color: s.color, completed: count };
    }));

    // Totals
    const [totalCompleted, totalActive] = await Promise.all([
      prisma.task.count({ where: { productId, deletedAt: null, completedAt: { not: null } } }),
      prisma.task.count({ where: { productId, deletedAt: null, completedAt: null } }),
    ]);

    reply.send({ tasksByDay, cycleTimeAvgDays, totalCompleted, totalActive, statusBreakdown, sprintVelocity });
  });
}
