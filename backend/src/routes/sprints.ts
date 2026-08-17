/**
 * Sprint routes - manage sprints (create, update, activate, end) and the
 * sprint planning assignments within a project.
 *
 * Only one sprint can be active at a time per project. Ending a sprint moves
 * incomplete tasks back to the backlog (unsets sprintId) and archives the sprint.
 * Sprint metadata (start/end dates, color) is used in the Gantt view's sprint swimlanes.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireTabRead, requireTabWrite } from '../utils/product-guard';
import { handleNotFound } from '../utils/prisma-errors';
import { validate } from '../utils/validate';
import { dispatchWebhooks } from '../utils/webhook-dispatch';
import { logger } from '../utils/logger';

// Validated color hexes
const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Invalid color (expected hex e.g. #7c3aed)');

// Sprint creation schema
const createSprintSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid startDate'),
  endDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid endDate'),
  color: hexColor.optional(),
  taskIds: z.array(z.string()).optional(),
});

// Sprint update schema
const updateSprintSchema = z.object({
  name: z.string().max(100).optional(),
  startDate: z
    .string()
    .refine((d) => !isNaN(new Date(d).getTime()), 'Invalid startDate')
    .optional(),
  endDate: z
    .string()
    .refine((d) => !isNaN(new Date(d).getTime()), 'Invalid endDate')
    .optional(),
  color: hexColor.optional(),
});

// Setting max number of tasks in a payload
const sprintTasksSchema = z.object({ taskIds: z.array(z.string()).max(1000) });

// Returning a sprint also returns taskIDs
const SPRINT_INCLUDE = {
  sprintTasks: { select: { taskId: true } },
};

export async function sprintRoutes(app: FastifyInstance) {
  // List all sprints for a project, ordered by start date
  app.get('/api/products/:productId/sprints', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    // requireTabRead already re-verifies membership internally (see product-guard.ts), so a
    // preceding requireProductMember call would be pure overhead.
    if (!(await requireTabRead(productId, req.user, ['kanban', 'gantt'], reply))) return;
    const sprints = await prisma.sprint.findMany({
      where: { productId },
      include: SPRINT_INCLUDE,
      orderBy: { startDate: 'asc' },
    });
    reply.send(
      sprints.map((s) => ({
        ...s,
        taskIds: s.sprintTasks.map((st) => st.taskId),
      })),
    );
  });

  // Create a sprint, optionally pre-assigning tasks in the same write
  app.post('/api/products/:productId/sprints', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, ['backlog'], reply))) return;
    const body = validate(createSprintSchema, req.body, reply);
    if (!body) return;
    const { name, startDate, endDate, color, taskIds } = body;

    // Create sprint with optional initial task assignments in a single write
    const sprint = await prisma.sprint.create({
      data: {
        productId,
        name,
        color: color ?? '#7c3aed',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        sprintTasks: taskIds?.length ? { create: taskIds.map((taskId) => ({ taskId })) } : undefined,
      },
      include: SPRINT_INCLUDE,
    });
    const result = {
      ...sprint,
      taskIds: sprint.sprintTasks.map((st) => st.taskId),
    };
    dispatchWebhooks(productId, 'subplan.created', result).catch((err) => {
      logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
    });
    reply.status(201).send(result);
  });

  // Update sprint name, dates, or color
  app.patch('/api/products/:productId/sprints/:sprintId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId } = req.params as {
      productId: string;
      sprintId: string;
    };
    if (!(await requireTabWrite(productId, req.user, ['backlog'], reply))) return;
    const body = validate(updateSprintSchema, req.body, reply);
    if (!body) return;
    const { name, startDate, endDate, color } = body;
    try {
      const sprint = await prisma.sprint.update({
        where: { id: sprintId, productId },
        data: {
          name,
          color,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        },
        include: SPRINT_INCLUDE,
      });
      const result = {
        ...sprint,
        taskIds: sprint.sprintTasks.map((st) => st.taskId),
      };
      dispatchWebhooks(productId, 'subplan.updated', result).catch((err) => {
        logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
      });
      reply.send(result);
    } catch (e) {
      handleNotFound(e, reply, 'Sprint not found');
    }
  });

  // Delete a sprint (cascade removes its task assignments, tasks themselves are unaffected)
  app.delete('/api/products/:productId/sprints/:sprintId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId } = req.params as {
      productId: string;
      sprintId: string;
    };
    if (!(await requireTabWrite(productId, req.user, ['backlog'], reply))) return;
    try {
      await prisma.sprint.delete({ where: { id: sprintId, productId } });
      dispatchWebhooks(productId, 'subplan.deleted', { id: sprintId }).catch((err) => {
        logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
      });
      reply.status(204).send();
    } catch (e) {
      handleNotFound(e, reply, 'Sprint not found');
    }
  });

  // Assign a batch of tasks to a sprint (silently skips tasks already assigned)
  app.post('/api/products/:productId/sprints/:sprintId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId } = req.params as {
      productId: string;
      sprintId: string;
    };
    if (!(await requireTabWrite(productId, req.user, ['backlog'], reply))) return;
    const body = validate(sprintTasksSchema, req.body, reply);
    if (!body) return;
    const { taskIds } = body;

    // Filter to tasks that actually belong to this product before assigning
    const validTasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, productId },
      select: { id: true },
    });
    await prisma.sprintTask.createMany({
      data: validTasks.map(({ id: taskId }) => ({ sprintId, taskId })),
      skipDuplicates: true,
    });
    const updated = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: SPRINT_INCLUDE,
    });
    if (updated)
      dispatchWebhooks(productId, 'subplan.updated', {
        ...updated,
        taskIds: updated.sprintTasks.map((st) => st.taskId),
      }).catch((err) => {
        logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
      });
    reply.send({ ok: true, added: validTasks.length });
  });

  // Remove a single task from a sprint (task itself is not deleted)
  app.delete(
    '/api/products/:productId/sprints/:sprintId/tasks/:taskId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { productId, sprintId, taskId } = req.params as {
        productId: string;
        sprintId: string;
        taskId: string;
      };
      if (!(await requireTabWrite(productId, req.user, ['backlog'], reply))) return;
      try {
        await prisma.sprintTask.delete({
          where: { sprintId_taskId: { sprintId, taskId } },
        });
        const updated = await prisma.sprint.findUnique({
          where: { id: sprintId },
          include: SPRINT_INCLUDE,
        });
        if (updated)
          dispatchWebhooks(productId, 'subplan.updated', {
            ...updated,
            taskIds: updated.sprintTasks.map((st) => st.taskId),
          }).catch((err) => {
            logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
          });
        reply.send({ ok: true });
      } catch (e) {
        handleNotFound(e, reply);
      }
    },
  );
}
