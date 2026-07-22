/**
 * Column (Kanban status) routes - manage the custom columns that define task
 * statuses within a project's Kanban board.
 *
 * Columns have a label, optional color, and an explicit position for ordering.
 * Reordering is done by updating the position field on multiple columns in one request.
 * Only project members with Kanban write access can create, update, or delete columns.
 */

import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireTabWrite } from '../utils/product-guard';
import { handleNotFound } from '../utils/prisma-errors';
import { validate } from '../utils/validate';

// Validation schema for creating a new column
const createColumnSchema = z.object({ label: z.string().min(1).max(50), color: z.string().optional() });

// Validation schema for reordering: array of { id, order } pairs for bulk position update
const reorderColumnSchema = z.object({ order: z.array(z.object({ id: z.string(), order: z.number().int() })) });

// Validation schema for updating an existing column's label or color
const updateColumnSchema = z.object({ label: z.string().max(50).optional(), color: z.string().optional() });

// Seed data for projects that have never had columns set up.
// isDone marks the column that counts as task completion (used in progress calculations).
// statusKey is stored on each task as its status value; the Done column uses the built-in 'done' key.
const DEFAULT_COLUMNS = [
  { label: 'To Do', color: '#3b82f6', order: 0, isDone: false, statusKey: 'todo' },
  { label: 'In Progress', color: '#f59e0b', order: 1, isDone: false, statusKey: 'in_progress' },
  { label: 'Blocked', color: '#ef4444', order: 2, isDone: false, statusKey: 'blocked' },
  { label: 'Done', color: '#10b981', order: 3, isDone: true, statusKey: 'done' },
];

// Lazily seeds default columns on first access so projects don't need columns pre-created at setup time
async function ensureColumns(productId: string) {
  const existing = await prisma.kanbanColumn.findMany({ where: { productId } });
  if (existing.length > 0) return existing;
  return prisma.$transaction(DEFAULT_COLUMNS.map((col) => prisma.kanbanColumn.create({ data: { productId, ...col } })));
}

export async function columnRoutes(app: FastifyInstance) {
  // List columns for a project, seeding defaults if none exist yet
  app.get('/api/products/:productId/columns', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    const columns = await ensureColumns(productId);
    reply.send(columns.sort((a, b) => a.order - b.order));
  });

  // Create a custom column, inserted just before the "Done" column to preserve completion semantics
  app.post('/api/products/:productId/columns', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban'], reply))) return;
    const body = validate(createColumnSchema, req.body, reply);
    if (!body) return;
    const { label, color } = body;

    // Ensure defaults exist and find the "Done" column to insert before it
    await ensureColumns(productId);
    const doneCol = await prisma.kanbanColumn.findFirst({ where: { productId, isDone: true } });
    const maxOrder = await prisma.kanbanColumn.aggregate({ where: { productId }, _max: { order: true } });
    const insertOrder = doneCol ? doneCol.order : (maxOrder._max.order ?? 0) + 1;

    // Bump the "Done" column's order to make room at insertOrder
    if (doneCol) {
      await prisma.kanbanColumn.update({ where: { id: doneCol.id }, data: { order: insertOrder + 1 } });
    }

    const statusKey = `col_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const column = await prisma.kanbanColumn.create({
      data: { productId, label, color: color ?? '#64748b', order: insertOrder, isDone: false, statusKey },
    });
    reply.status(201).send(column);
  });

  // Reorder columns by updating all positions in one transaction; must be registered before /:columnId to avoid route conflict
  app.patch('/api/products/:productId/columns/reorder', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban'], reply))) return;
    const reorderBody = validate(reorderColumnSchema, req.body, reply);
    if (!reorderBody) return;
    const { order } = reorderBody;
    await prisma.$transaction(
      order.map(({ id, order: o }) => prisma.kanbanColumn.update({ where: { id, productId }, data: { order: o } })),
    );
    reply.send({ ok: true });
  });

  // Update a single column's label or color
  app.patch('/api/products/:productId/columns/:columnId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, columnId } = req.params as { productId: string; columnId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban'], reply))) return;
    const body = validate(updateColumnSchema, req.body, reply);
    if (!body) return;
    const { label, color } = body;
    try {
      const col = await prisma.kanbanColumn.update({ where: { id: columnId, productId }, data: { label, color } });
      reply.send(col);
    } catch (e) {
      handleNotFound(e, reply);
    }
  });

  // Delete a column; tasks in it are moved to "todo" atomically — the "Done" column cannot be deleted
  app.delete('/api/products/:productId/columns/:columnId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, columnId } = req.params as { productId: string; columnId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban'], reply))) return;
    const col = await prisma.kanbanColumn.findFirst({ where: { id: columnId, productId } });
    if (!col) return reply.status(404).send({ error: 'Not found' });
    if (col.isDone) return reply.status(400).send({ error: 'Cannot delete the completion column' });

    // Atomically reset orphaned tasks to 'todo' and remove the column
    await prisma.$transaction([
      prisma.task.updateMany({ where: { productId, status: col.statusKey }, data: { status: 'todo' } }),
      prisma.kanbanColumn.delete({ where: { id: columnId } }),
    ]);
    reply.status(204).send();
  });
}
