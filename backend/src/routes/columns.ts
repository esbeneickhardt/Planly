import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireTabWrite } from '../utils/product-guard';

const createColumnSchema = z.object({ label: z.string().min(1).max(50), color: z.string().optional() });
const reorderColumnSchema = z.object({ order: z.array(z.object({ id: z.string(), order: z.number().int() })) });
const updateColumnSchema = z.object({ label: z.string().max(50).optional(), color: z.string().optional() });

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
  app.get('/api/products/:productId/columns', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const columns = await ensureColumns(productId);
    reply.send(columns.sort((a, b) => a.order - b.order));
  });

  app.post('/api/products/:productId/columns', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireTabWrite(productId, req.user.userId, ['kanban'], reply)) return;
    const parsed = createColumnSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'label required' });
    const { label, color } = parsed.data;

    await ensureColumns(productId);
    const doneCol = await prisma.kanbanColumn.findFirst({ where: { productId, isDone: true } });
    const maxOrder = await prisma.kanbanColumn.aggregate({ where: { productId }, _max: { order: true } });
    const insertOrder = doneCol ? doneCol.order : (maxOrder._max.order ?? 0) + 1;

    if (doneCol) {
      await prisma.kanbanColumn.update({ where: { id: doneCol.id }, data: { order: insertOrder + 1 } });
    }

    const statusKey = `col_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const column = await prisma.kanbanColumn.create({
      data: { productId, label, color: color ?? '#64748b', order: insertOrder, isDone: false, statusKey },
    });
    reply.status(201).send(column);
  });

  // Must be registered BEFORE /:columnId
  app.patch('/api/products/:productId/columns/reorder', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireTabWrite(productId, req.user.userId, ['kanban'], reply)) return;
    const reorderParsed = reorderColumnSchema.safeParse(req.body);
    if (!reorderParsed.success) return reply.status(400).send({ error: 'order array required' });
    const { order } = reorderParsed.data;
    await prisma.$transaction(
      order.map(({ id, order: o }) => prisma.kanbanColumn.update({ where: { id, productId }, data: { order: o } }))
    );
    reply.send({ ok: true });
  });

  app.patch('/api/products/:productId/columns/:columnId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, columnId } = req.params as { productId: string; columnId: string };
    if (!await requireTabWrite(productId, req.user.userId, ['kanban'], reply)) return;
    const parsed = updateColumnSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const { label, color } = parsed.data;
    try {
      const col = await prisma.kanbanColumn.update({ where: { id: columnId, productId }, data: { label, color } });
      reply.send(col);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/products/:productId/columns/:columnId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, columnId } = req.params as { productId: string; columnId: string };
    if (!await requireTabWrite(productId, req.user.userId, ['kanban'], reply)) return;
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
