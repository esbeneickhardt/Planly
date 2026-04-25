import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

const DEFAULT_COLUMNS = [
  { label: 'To Do',       color: '#3b82f6', order: 0, isDone: false, statusKey: 'todo'        },
  { label: 'In Progress', color: '#f59e0b', order: 1, isDone: false, statusKey: 'in_progress' },
  { label: 'Blocked',     color: '#ef4444', order: 2, isDone: false, statusKey: 'blocked'     },
  { label: 'Done',        color: '#10b981', order: 3, isDone: true,  statusKey: 'done'        },
];

async function ensureColumns(productId: string) {
  const existing = await prisma.kanbanColumn.findMany({ where: { productId } });
  if (existing.length > 0) return existing;
  return prisma.$transaction(
    DEFAULT_COLUMNS.map((col) =>
      prisma.kanbanColumn.create({ data: { productId, ...col } })
    )
  );
}

export async function columnRoutes(app: FastifyInstance) {
  // List columns (lazy-creates defaults)
  app.get('/api/products/:productId/columns', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const columns = await ensureColumns(productId);
    reply.send(columns.sort((a, b) => a.order - b.order));
  });

  // Create a new custom column
  app.post('/api/products/:productId/columns', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { label, color } = req.body as { label: string; color?: string };
    if (!label) return reply.status(400).send({ error: 'label required' });

    await ensureColumns(productId);
    const maxOrder = await prisma.kanbanColumn.aggregate({ where: { productId }, _max: { order: true } });
    const order = (maxOrder._max.order ?? 0) + 1;

    // Put new column before the done column
    const doneCol = await prisma.kanbanColumn.findFirst({ where: { productId, isDone: true } });
    const insertOrder = doneCol ? doneCol.order : order;

    // Shift done column up
    if (doneCol) {
      await prisma.kanbanColumn.update({ where: { id: doneCol.id }, data: { order: insertOrder + 1 } });
    }

    const statusKey = `col_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const column = await prisma.kanbanColumn.create({
      data: { productId, label, color: color ?? '#64748b', order: insertOrder, isDone: false, statusKey },
    });
    reply.status(201).send(column);
  });

  // Reorder columns — must be registered BEFORE /:columnId
  app.patch('/api/products/:productId/columns/reorder', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { order } = req.body as { order: { id: string; order: number }[] };
    await prisma.$transaction(
      order.map(({ id, order: o }) => prisma.kanbanColumn.update({ where: { id, productId }, data: { order: o } }))
    );
    reply.send({ ok: true });
  });

  // Update column label/color
  app.patch('/api/products/:productId/columns/:columnId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, columnId } = req.params as { productId: string; columnId: string };
    const { label, color } = req.body as { label?: string; color?: string };
    try {
      const col = await prisma.kanbanColumn.update({
        where: { id: columnId, productId },
        data: { label, color },
      });
      reply.send(col);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // Delete column (reassign its tasks to backlog)
  app.delete('/api/products/:productId/columns/:columnId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, columnId } = req.params as { productId: string; columnId: string };
    const col = await prisma.kanbanColumn.findFirst({ where: { id: columnId, productId } });
    if (!col) return reply.status(404).send({ error: 'Not found' });
    if (col.isDone) return reply.status(400).send({ error: 'Cannot delete the completion column' });

    await prisma.$transaction([
      prisma.task.updateMany({ where: { productId, status: col.statusKey }, data: { status: 'todo' } }),
      prisma.kanbanColumn.delete({ where: { id: columnId } }),
    ]);
    reply.send({ ok: true });
  });
}
