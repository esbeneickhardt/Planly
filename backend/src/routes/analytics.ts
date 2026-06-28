import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/analytics', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;

    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - 89); // 90 days inclusive
    since.setHours(0, 0, 0, 0);

    // Tasks completed in last 90 days, grouped by day
    const completedTasks = await prisma.task.findMany({
      where: {
        productId,
        deletedAt: null,
        completedAt: { gte: since },
      },
      select: { completedAt: true, completedBy: true },
    });

    // Build day buckets (last 90 days)
    const dayMap = new Map<string, number>();
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const t of completedTasks) {
      if (!t.completedAt) continue;
      const key = t.completedAt.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const tasksByDay = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));

    // Top contributors by tasks completed (all time)
    const allCompleted = await prisma.task.findMany({
      where: { productId, deletedAt: null, completedBy: { not: null } },
      select: { completedBy: true },
    });
    const contributorMap = new Map<string, number>();
    for (const t of allCompleted) {
      if (!t.completedBy) continue;
      contributorMap.set(t.completedBy, (contributorMap.get(t.completedBy) ?? 0) + 1);
    }
    const topUserIds = [...contributorMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    const contributorUsers = await prisma.user.findMany({
      where: { id: { in: topUserIds } },
      select: { id: true, username: true, avatarEmoji: true },
    });
    const topContributors = topUserIds
      .map((id) => {
        const u = contributorUsers.find((u) => u.id === id);
        return u ? { userId: u.id, username: u.username, avatarEmoji: u.avatarEmoji, count: contributorMap.get(id) ?? 0 } : null;
      })
      .filter(Boolean);

    // Average cycle time: createdAt → completedAt in days
    const cycleTimeTasks = await prisma.task.findMany({
      where: { productId, deletedAt: null, completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
    });
    let cycleTimeAvgDays: number | null = null;
    if (cycleTimeTasks.length > 0) {
      const totalMs = cycleTimeTasks.reduce((sum, t) => {
        return sum + (t.completedAt!.getTime() - t.createdAt.getTime());
      }, 0);
      cycleTimeAvgDays = Math.round((totalMs / cycleTimeTasks.length / 86400000) * 10) / 10;
    }

    // Totals
    const [totalCompleted, totalActive] = await Promise.all([
      prisma.task.count({ where: { productId, deletedAt: null, completedAt: { not: null } } }),
      prisma.task.count({ where: { productId, deletedAt: null, completedAt: null } }),
    ]);

    reply.send({ tasksByDay, topContributors, cycleTimeAvgDays, totalCompleted, totalActive });
  });
}
