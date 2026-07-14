/**
 * Subtask routes - create, update, and delete subtasks within a task.
 */
import { FastifyInstance } from 'fastify';
import prisma from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { requireProductMember, requireTabWrite } from '../../utils/product-guard';
import { z } from 'zod';
import { validate } from '../../utils/validate';
import { TASK_WHERE_ACTIVE } from './crud';

const createSubtaskSchema = z.object({ name: z.string().min(1).max(200) });
const updateSubtaskSchema = z.object({ name: z.string().max(200).optional(), completed: z.boolean().optional(), order: z.number().int().optional() });

export async function subtaskRoutes(app: FastifyInstance) {
  app.post('/api/products/:productId/tasks/:taskId/subtasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    const stBody = validate(createSubtaskSchema, req.body, reply);
    if (!stBody) return;

    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } });
    if (!task) return reply.status(404).send({ error: 'Not found' });

    const count = await prisma.subtask.count({ where: { taskId } });
    if (count >= 500) return reply.status(400).send({ error: 'Subtask limit reached (max 500)' });
    const subtask = await prisma.subtask.create({ data: { taskId, name: stBody.name.trim(), order: count } });
    reply.status(201).send(subtask);
  });

  app.patch('/api/products/:productId/tasks/:taskId/subtasks/:subtaskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId, subtaskId } = req.params as { productId: string; taskId: string; subtaskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    const updateStBody = validate(updateSubtaskSchema, req.body, reply);
    if (!updateStBody) return;
    const { name, completed, order } = updateStBody;

    // Track who completed the subtask (or clear it) when toggling completion
    const completedFields =
      completed === true ? { completedBy: req.user.userId, completedAt: new Date() }
      : completed === false ? { completedBy: null, completedAt: null }
      : {};

    try {
      const subtask = await prisma.subtask.update({
        where: { id: subtaskId, taskId },
        data: { name: name?.trim(), completed, order, ...completedFields },
      });
      reply.send(subtask);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/products/:productId/tasks/:taskId/subtasks/:subtaskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId, subtaskId } = req.params as { productId: string; taskId: string; subtaskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    try {
      await prisma.subtask.delete({ where: { id: subtaskId, taskId } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });
}
