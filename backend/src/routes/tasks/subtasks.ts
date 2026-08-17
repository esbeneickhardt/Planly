/**
 * Subtask routes - create, update, and delete checklist-style subtasks within a task.
 *
 * Subtasks are ordered by an explicit `order` field (0-based). Completion records
 * completedBy/completedAt when toggled to true, and clears those fields when toggled back.
 * Each task is capped at 500 subtasks to prevent runaway data growth.
 */
import { FastifyInstance } from 'fastify';
import prisma from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { requireTabWrite } from '../../utils/product-guard';
import { z } from 'zod';
import { validate } from '../../utils/validate';
import { TASK_WHERE_ACTIVE } from './crud';
import { handleNotFound } from '../../utils/prisma-errors';

// Validates the subtask name on creation
const createSubtaskSchema = z.object({ name: z.string().min(1).max(200) });
// Partial update for subtask text, completion state, and sort order
const updateSubtaskSchema = z.object({
  name: z.string().max(200).optional(),
  completed: z.boolean().optional(),
  order: z.number().int().optional(),
});

export async function subtaskRoutes(app: FastifyInstance) {
  // Add a subtask to a task; new subtask is appended at the end (order = current count)
  app.post('/api/products/:productId/tasks/:taskId/subtasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as {
      productId: string;
      taskId: string;
    };
    // requireTabWrite already re-verifies membership internally (see product-guard.ts), so a
    // preceding requireProductMember call would be pure overhead.
    if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
    const stBody = validate(createSubtaskSchema, req.body, reply);
    if (!stBody) return;

    const task = await prisma.task.findFirst({
      where: { id: taskId, productId, ...TASK_WHERE_ACTIVE },
    });
    if (!task) return reply.status(404).send({ error: 'Not found' });

    const count = await prisma.subtask.count({ where: { taskId } });
    if (count >= 500) return reply.status(400).send({ error: 'Subtask limit reached (max 500)' });
    const subtask = await prisma.subtask.create({
      data: { taskId, name: stBody.name.trim(), order: count },
    });
    reply.status(201).send(subtask);
  });

  // Update a subtask's name, completion state, or sort order
  app.patch(
    '/api/products/:productId/tasks/:taskId/subtasks/:subtaskId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { productId, taskId, subtaskId } = req.params as {
        productId: string;
        taskId: string;
        subtaskId: string;
      };
      if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
      const updateStBody = validate(updateSubtaskSchema, req.body, reply);
      if (!updateStBody) return;
      const { name, completed, order } = updateStBody;

      // Track who completed the subtask (or clear it) when toggling completion
      const completedFields =
        completed === true
          ? { completedBy: req.user.userId, completedAt: new Date() }
          : completed === false
            ? { completedBy: null, completedAt: null }
            : {};

      try {
        const subtask = await prisma.subtask.update({
          where: { id: subtaskId, taskId },
          data: { name: name?.trim(), completed, order, ...completedFields },
        });
        reply.send(subtask);
      } catch (e) {
        handleNotFound(e, reply);
      }
    },
  );

  // Delete a subtask permanently
  app.delete(
    '/api/products/:productId/tasks/:taskId/subtasks/:subtaskId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { productId, taskId, subtaskId } = req.params as {
        productId: string;
        taskId: string;
        subtaskId: string;
      };
      if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
      try {
        await prisma.subtask.delete({ where: { id: subtaskId, taskId } });
        reply.send({ ok: true });
      } catch (e) {
        handleNotFound(e, reply);
      }
    },
  );
}
