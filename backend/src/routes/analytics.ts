/**
 * Analytics routes - aggregate statistics for a project's Analytics tab.
 *
 * Computes throughput (tasks completed per week), workload distribution per assignee,
 * cycle velocity (average days from start to completion), and priority breakdown.
 * Data is scoped to the last 90 days. Requires Analytics tab read access.
 */
import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireTabRead } from '../utils/product-guard';

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/analytics', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    if (!(await requireTabRead(productId, req.user, ['analytics'], reply))) return;

    // Verify analytics access — owners and co-owners can view even when disabled
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

    // 90-day throughput: tasks completed per day
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

    // Average cycle time: creation-to-completion across all completed tasks
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
    const sprintVelocity = await Promise.all(
      sprints.map(async (s) => {
        const count = await prisma.task.count({
          where: {
            productId,
            deletedAt: null,
            completedAt: { gte: s.startDate, lte: s.endDate },
          },
        });
        return {
          sprintId: s.id,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          color: s.color,
          completed: count,
        };
      }),
    );

    // Totals
    const [totalCompleted, totalActive] = await Promise.all([
      prisma.task.count({ where: { productId, deletedAt: null, completedAt: { not: null } } }),
      prisma.task.count({ where: { productId, deletedAt: null, completedAt: null } }),
    ]);

    reply.send({ tasksByDay, cycleTimeAvgDays, totalCompleted, totalActive, statusBreakdown, sprintVelocity });
  });

  // Personal workload - returns only the requesting user's own tasks, nobody else's
  app.get('/api/products/:productId/analytics/workload', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;

    const userId = req.user.userId;

    // Fetch active task breakdown by status, recent completions, and all-time total in parallel
    const [activeGroups, completedRecent, totalCompleted] = await Promise.all([
      prisma.task.groupBy({
        by: ['status'],
        where: { productId, ownerId: userId, deletedAt: null, completedAt: null },
        _count: { _all: true },
      }),
      prisma.task.findMany({
        where: {
          productId,
          ownerId: userId,
          deletedAt: null,
          completedAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
        select: { completedAt: true },
      }),
      prisma.task.count({ where: { productId, ownerId: userId, deletedAt: null, completedAt: { not: null } } }),
    ]);

    const statusBreakdown = activeGroups.map((g) => ({ status: g.status, count: g._count._all }));
    const totalActive = activeGroups.reduce((s, g) => s + g._count._all, 0);

    // 30-day completion trend
    const now = new Date();
    const dayMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const t of completedRecent) {
      if (!t.completedAt) continue;
      const key = t.completedAt.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const completionsByDay = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));

    reply.send({ statusBreakdown, totalActive, totalCompleted, completionsByDay });
  });
}
