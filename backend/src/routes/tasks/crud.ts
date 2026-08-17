/**
 * Task CRUD routes - list, create, read, update, soft-delete, bulk reorder, and canvas position.
 * All routes go through requireTabRead/requireTabWrite guards, which re-verify project membership
 * internally (see product-guard.ts) - no separate membership check is needed on top. Owner and
 * reviewer assignments are validated to be project members before writing. Status transitions to
 * 'done' automatically record completedBy/completedAt; reverting from 'done' clears those fields.
 */

import { FastifyInstance } from 'fastify';
import prisma from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { requireTabRead, requireTabWrite } from '../../utils/product-guard';
import { dispatchWebhooks, dispatchWebhooksBatch } from '../../utils/webhook-dispatch';
import { createNotification } from '../../utils/notifications';
import { logActivity, logActivityBatch } from '../../utils/activity';
import { logger } from '../../utils/logger';
import { broadcast } from '../../realtime/manager';
import { z } from 'zod';
import { validate } from '../../utils/validate';
import { createTaskSchema, updateTaskSchema, bulkUpdateTaskSchema, bulkDeleteTaskSchema } from '../../schemas/tasks';
import { safeDecryptValue } from '../../utils/crypto';

// Validation schema for bulk kanban reorder (up to 1000 tasks per call)
const reorderSchema = z.object({
  updates: z.array(z.object({ taskId: z.string(), order: z.number().int() })).max(1000),
});

// Validation schema for bulk milestone reorder (up to 1000 milestones per call)
const milestoneReorderSchema = z.object({
  updates: z.array(z.object({ taskId: z.string(), order: z.number().int() })).max(1000),
});

// Validation schema for canvas drag position updates
const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

// Shared Prisma include shape returned by every task read - keeps all routes consistent
export const TASK_INCLUDE = {
  owner: { select: { id: true, username: true, realName: true, avatarEmoji: true } },
  reviewer: { select: { id: true, username: true, realName: true, avatarEmoji: true } },
  creator: { select: { id: true, username: true, realName: true } },
  subtasks: { orderBy: { order: 'asc' as const } },
  dependsOn: { select: { prerequisiteId: true } },
  requiredBy: { select: { dependentId: true } },
};

// Decrypt realName on owner, reviewer, and creator before sending to the client
function decryptTaskPii<
  T extends {
    owner?: { realName: string | null } | null;
    reviewer?: { realName: string | null } | null;
    creator?: { realName: string | null } | null;
  },
>(task: T): T {
  const dec = (u: { realName: string | null } | null | undefined) =>
    u ? { ...u, realName: u.realName ? safeDecryptValue(u.realName) : null } : u;
  return { ...task, owner: dec(task.owner), reviewer: dec(task.reviewer), creator: dec(task.creator) };
}

// Shared filter that excludes soft-deleted tasks from all queries
export const TASK_WHERE_ACTIVE = { deletedAt: null };

export async function taskCrudRoutes(app: FastifyInstance) {
  // List all active tasks for a project, cursor-paginated by creation time (max 500 per page)
  app.get('/api/products/:productId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabRead(productId, req.user, ['kanban', 'backlog'], reply))) return;

    const { cursor, limit = '500' } = req.query as { cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit), 500);

    const tasks = await prisma.task.findMany({
      where: { productId, ...TASK_WHERE_ACTIVE, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
      include: TASK_INCLUDE,
      orderBy: { kanbanOrder: 'asc' },
      take,
    });
    reply.send(tasks.map(decryptTaskPii));
  });

  // Bulk-update kanban sort positions in one transaction; must be registered before /:taskId to avoid route conflict
  app.patch('/api/products/:productId/tasks/reorder', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
    const reorderBody = validate(reorderSchema, req.body, reply);
    if (!reorderBody) return;
    const { updates } = reorderBody;
    await prisma.$transaction(
      updates.map(({ taskId, order }) =>
        prisma.task.update({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE }, data: { kanbanOrder: order } }),
      ),
    );
    reply.send({ ok: true });
  });

  // Bulk-update milestone sort positions (shared across Gantt and Kanban's milestone views), in one
  // transaction. Must be registered before /:taskId to avoid route conflict.
  app.patch('/api/products/:productId/tasks/milestone-reorder', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban', 'gantt'], reply))) return;
    const reorderBody = validate(milestoneReorderSchema, req.body, reply);
    if (!reorderBody) return;
    const { updates } = reorderBody;
    await prisma.$transaction(
      updates.map(({ taskId, order }) =>
        prisma.task.update({
          where: { id: taskId, productId, ...TASK_WHERE_ACTIVE },
          data: { milestoneOrder: order },
        }),
      ),
    );
    reply.send({ ok: true });
  });

  // Bulk-apply the same field changes (owner/reviewer/status/etc) to many tasks in one transaction.
  // One realtime broadcast for the whole batch instead of one per task - this is what lets a
  // multi-select bulk action in the UI (or a scripted API caller) avoid firing N separate PATCH
  // requests, which otherwise floods every connected client with N broadcasts.
  // Must be registered before /:taskId to avoid route conflict.
  app.patch('/api/products/:productId/tasks/bulk-update', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
    const body = validate(bulkUpdateTaskSchema, req.body, reply);
    if (!body) return;
    const { taskIds, ...data } = body;

    if (data.ownerId) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: data.ownerId, team: { products: { some: { id: productId } } } },
      });
      if (!member) return reply.status(400).send({ error: 'ownerId must be a project member' });
    }
    if (data.reviewerId) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: data.reviewerId, team: { products: { some: { id: productId } } } },
      });
      if (!member) return reply.status(400).send({ error: 'reviewerId must be a project member' });
    }
    if (data.deadline && isNaN(new Date(data.deadline).getTime())) {
      return reply.status(400).send({ error: 'Invalid deadline date' });
    }

    const existing = await prisma.task.findMany({
      where: { id: { in: taskIds }, productId, ...TASK_WHERE_ACTIVE },
      select: { id: true, name: true, status: true, ownerId: true, reviewerId: true },
    });
    if (existing.length === 0) return reply.status(404).send({ error: 'No matching tasks found' });

    const updated = await prisma.$transaction(
      existing.map((t) => {
        const completedFields =
          data.status === 'done' && t.status !== 'done'
            ? { completedBy: req.user.userId, completedAt: new Date() }
            : data.status && data.status !== 'done' && t.status === 'done'
              ? { completedBy: null, completedAt: null }
              : {};
        return prisma.task.update({
          where: { id: t.id },
          data: {
            name: data.name?.trim(),
            description: data.description,
            ownerId: data.ownerId,
            reviewerId: data.reviewerId === null ? null : data.reviewerId,
            color: data.color,
            status: data.status,
            deadline: data.deadline === null ? null : data.deadline ? new Date(data.deadline) : undefined,
            ...completedFields,
          },
          include: TASK_INCLUDE,
        });
      }),
    );

    // Fire webhooks and log activity once for the whole batch (not once per task): dispatchWebhooksBatch
    // fetches the webhook list a single time instead of re-querying it per task, and logActivityBatch
    // writes every event in one createMany instead of one insert per task. Assignment notifications
    // still go out per-task below since each can have a different recipient.
    const statusChanged = data.status !== undefined;
    const ownerChanged = data.ownerId !== undefined;
    const eventName = statusChanged ? 'task.status_changed' : ownerChanged ? 'task.assigned' : 'task.updated';
    const decryptedUpdated = updated.map(decryptTaskPii);
    const prevById = new Map(existing.map((t) => [t.id, t]));

    dispatchWebhooksBatch(productId, eventName, decryptedUpdated).catch((err) => {
      logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
    });
    logActivityBatch(
      decryptedUpdated.map((task) => ({
        productId,
        actorId: req.user.userId,
        action: eventName,
        entityType: 'task',
        entityId: task.id,
        entityName: task.name,
      })),
    );

    decryptedUpdated.forEach((task) => {
      const prev = prevById.get(task.id)!;
      if (data.ownerId && data.ownerId !== prev.ownerId && data.ownerId !== req.user.userId) {
        createNotification({
          userId: data.ownerId,
          type: 'task_assigned',
          title: `You were assigned to "${task.name}"`,
          productId,
          taskId: task.id,
        });
      }
      if (data.reviewerId && data.reviewerId !== prev.reviewerId && data.reviewerId !== req.user.userId) {
        createNotification({
          userId: data.reviewerId,
          type: 'task_assigned',
          title: `You were set as reviewer for "${task.name}"`,
          productId,
          taskId: task.id,
        });
      }
    });

    broadcast(productId, 'task.bulk_updated', { taskIds: decryptedUpdated.map((t) => t.id) }, req.user.tokenVersion === undefined);
    reply.send(decryptedUpdated);
  });

  // Bulk soft-delete - one transaction, one broadcast. Must be registered before /:taskId.
  app.post('/api/products/:productId/tasks/bulk-delete', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
    const body = validate(bulkDeleteTaskSchema, req.body, reply);
    if (!body) return;

    const existing = await prisma.task.findMany({
      where: { id: { in: body.taskIds }, productId, ...TASK_WHERE_ACTIVE },
      select: { id: true, name: true },
    });
    if (existing.length === 0) return reply.status(204).send();

    await prisma.task.updateMany({
      where: { id: { in: existing.map((t) => t.id) } },
      data: { deletedAt: new Date() },
    });

    // Same batching as bulk-update above: one webhook-list fetch and one activity insert for the
    // whole batch instead of one of each per task.
    dispatchWebhooksBatch(
      productId,
      'task.deleted',
      existing.map((task) => ({ id: task.id, name: task.name })),
    ).catch((err) => {
      logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
    });
    logActivityBatch(
      existing.map((task) => ({
        productId,
        actorId: req.user.userId,
        action: 'task.deleted',
        entityType: 'task',
        entityId: task.id,
        entityName: task.name,
      })),
    );

    broadcast(productId, 'task.bulk_deleted', { ids: existing.map((t) => t.id) }, req.user.tokenVersion === undefined);
    reply.status(204).send();
  });

  // Create a task, then fire webhooks, broadcast, activity log, and assignment notifications
  app.post('/api/products/:productId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
    const body = validate(createTaskSchema, req.body, reply);
    if (!body) return;
    const { name, description, ownerId, reviewerId, color, deadline, canvasX, canvasY, status } = body;

    // Validate that owner, reviewer, and deadline are well-formed before writing
    if (ownerId) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: ownerId, team: { products: { some: { id: productId } } } },
      });
      if (!member) return reply.status(400).send({ error: 'ownerId must be a project member' });
    }
    if (reviewerId) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: reviewerId, team: { products: { some: { id: productId } } } },
      });
      if (!member) return reply.status(400).send({ error: 'reviewerId must be a project member' });
    }
    if (deadline && isNaN(new Date(deadline).getTime())) {
      return reply.status(400).send({ error: 'Invalid deadline date' });
    }

    const task = await prisma.task.create({
      data: {
        productId,
        name,
        description,
        ownerId,
        reviewerId,
        color,
        canvasX,
        canvasY,
        status: status || undefined,
        deadline: deadline ? new Date(deadline) : undefined,
        createdBy: req.user.userId,
      },
      include: TASK_INCLUDE,
    });

    // Fire webhooks, realtime broadcast, activity log, and assignment notifications
    const decryptedTask = decryptTaskPii(task);
    dispatchWebhooks(productId, 'task.created', decryptedTask).catch((err) => {
      logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
    });
    broadcast(productId, 'task.created', decryptedTask, req.user.tokenVersion === undefined);
    logActivity({
      productId,
      actorId: req.user.userId,
      action: 'task.created',
      entityType: 'task',
      entityId: task.id,
      entityName: task.name,
    });
    if (ownerId && ownerId !== req.user.userId) {
      createNotification({
        userId: ownerId,
        type: 'task_assigned',
        title: `You were assigned to "${task.name}"`,
        productId,
        taskId: task.id,
      });
    }
    if (reviewerId && reviewerId !== req.user.userId && reviewerId !== ownerId) {
      createNotification({
        userId: reviewerId,
        type: 'task_assigned',
        title: `You were set as reviewer for "${task.name}"`,
        productId,
        taskId: task.id,
      });
    }
    reply.status(201).send(decryptedTask);
  });

  // Fetch a single task with full relations (owner, reviewer, subtasks, dependencies)
  app.get('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!(await requireTabRead(productId, req.user, ['kanban', 'backlog', 'canvas', 'gantt'], reply))) return;
    const task = await prisma.task.findFirst({
      where: { id: taskId, productId, ...TASK_WHERE_ACTIVE },
      include: TASK_INCLUDE,
    });
    if (!task) return reply.status(404).send({ error: 'Not found' });
    reply.send(decryptTaskPii(task));
  });

  // Update task fields; handles completion timestamps, webhooks, broadcast, and assignment notifications
  app.patch('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
    const body = validate(updateTaskSchema, req.body, reply);
    if (!body) return;

    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } });
    if (!task) return reply.status(404).send({ error: 'Not found' });

    // Validate that owner, reviewer, and deadline are well-formed before writing
    if (body.ownerId) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: body.ownerId, team: { products: { some: { id: productId } } } },
      });
      if (!member) return reply.status(400).send({ error: 'ownerId must be a project member' });
    }
    if (body.reviewerId) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: body.reviewerId, team: { products: { some: { id: productId } } } },
      });
      if (!member) return reply.status(400).send({ error: 'reviewerId must be a project member' });
    }
    if (body.deadline && isNaN(new Date(body.deadline).getTime())) {
      return reply.status(400).send({ error: 'Invalid deadline date' });
    }

    // Track completion timestamp when status transitions to/from done
    const completedFields =
      body.status === 'done' && task.status !== 'done'
        ? { completedBy: req.user.userId, completedAt: new Date() }
        : body.status && body.status !== 'done' && task.status === 'done'
          ? { completedBy: null, completedAt: null }
          : {};

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        name: body.name?.trim(),
        description: body.description,
        ownerId: body.ownerId,
        reviewerId: body.reviewerId === null ? null : body.reviewerId,
        color: body.color,
        status: body.status,
        canvasX: body.canvasX,
        canvasY: body.canvasY,
        deadline: body.deadline === null ? null : body.deadline ? new Date(body.deadline) : undefined,
        ...completedFields,
      },
      include: TASK_INCLUDE,
    });

    // Fire webhooks, realtime broadcast, activity log, and assignment notifications
    const statusChanged = body.status !== undefined && body.status !== task.status;
    const ownerChanged = body.ownerId !== undefined && body.ownerId !== task.ownerId;
    const eventName = statusChanged ? 'task.status_changed' : ownerChanged ? 'task.assigned' : 'task.updated';
    const decryptedUpdated = decryptTaskPii(updated);
    dispatchWebhooks(productId, eventName, decryptedUpdated).catch((err) => {
      logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
    });
    broadcast(productId, eventName, decryptedUpdated, req.user.tokenVersion === undefined);
    logActivity({
      productId,
      actorId: req.user.userId,
      action: eventName,
      entityType: 'task',
      entityId: updated.id,
      entityName: updated.name,
    });

    if (body.ownerId && body.ownerId !== task.ownerId && body.ownerId !== req.user.userId) {
      createNotification({
        userId: body.ownerId,
        type: 'task_assigned',
        title: `You were assigned to "${updated.name}"`,
        productId,
        taskId: task.id,
      });
    }
    if (body.reviewerId && body.reviewerId !== task.reviewerId && body.reviewerId !== req.user.userId) {
      createNotification({
        userId: body.reviewerId,
        type: 'task_assigned',
        title: `You were set as reviewer for "${updated.name}"`,
        productId,
        taskId: task.id,
      });
    }
    reply.send(decryptedUpdated);
  });

  // Soft-delete a task (sets deletedAt); returns 204 even if already deleted to keep clients idempotent
  app.delete('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!(await requireTabWrite(productId, req.user, ['kanban', 'backlog'], reply))) return;
    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } });
    if (task) {
      await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
      dispatchWebhooks(productId, 'task.deleted', { id: taskId, name: task.name }).catch((err) => {
        logger.warn({ err: (err as Error).message }, 'webhook dispatch failed');
      });
      broadcast(productId, 'task.deleted', { id: taskId }, req.user.tokenVersion === undefined);
      logActivity({
        productId,
        actorId: req.user.userId,
        action: 'task.deleted',
        entityType: 'task',
        entityId: taskId,
        entityName: task.name,
      });
    }
    reply.status(204).send();
  });

  // Update a task's canvas (x, y) coordinates - separate from main PATCH to avoid triggering webhooks on drag
  app.patch('/api/products/:productId/tasks/:taskId/position', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!(await requireTabWrite(productId, req.user, ['canvas'], reply))) return;
    const posBody = validate(positionSchema, req.body, reply);
    if (!posBody) return;
    const { x, y } = posBody;
    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } });
    if (!task) return reply.status(404).send({ error: 'Not found' });
    await prisma.task.update({ where: { id: taskId }, data: { canvasX: x, canvasY: y } });
    reply.send({ ok: true });
  });
}
