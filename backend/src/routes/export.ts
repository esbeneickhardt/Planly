import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductCoOwner } from '../utils/product-guard';

export async function exportRoutes(app: FastifyInstance) {
  // Full product data export as JSON
  app.get('/api/products/:productId/export', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;

    const [product, tasks, columns, sprints, messages, colorLegend, snapshots] = await Promise.all([
      prisma.product.findFirst({
        where: { id: productId, deletedAt: null },
        include: { ownerUser: { select: { id: true, username: true } } },
      }),
      prisma.task.findMany({
        where: { productId, deletedAt: null },
        include: {
          subtasks: { orderBy: { order: 'asc' } },
          dependsOn: { select: { prerequisiteId: true } },
          owner: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.kanbanColumn.findMany({ where: { productId }, orderBy: { order: 'asc' } }),
      prisma.sprint.findMany({
        where: { productId },
        include: { sprintTasks: { select: { taskId: true } } },
        orderBy: { startDate: 'asc' },
      }),
      prisma.message.findMany({
        where: { productId },
        include: { author: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
      prisma.colorLegendEntry.findMany({ where: { productId } }),
      prisma.canvasSnapshot.findMany({ where: { productId }, include: { user: { select: { id: true, username: true } } } }),
    ]);

    if (!product) return reply.status(404).send({ error: 'Not found' });

    const exportedAt = new Date().toISOString();
    reply
      .header('Content-Disposition', `attachment; filename="planly-export-${product.name.replace(/[^a-z0-9]/gi, '-')}-${exportedAt.slice(0, 10)}.json"`)
      .header('Content-Type', 'application/json')
      .send(JSON.stringify({
        exportedAt,
        exportVersion: 1,
        product: { ...product, tasks: undefined },
        tasks,
        columns,
        sprints,
        colorLegend,
        canvasSnapshots: snapshots,
        messages,
      }, null, 2));
  });
}
