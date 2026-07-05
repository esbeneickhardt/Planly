import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireTabWrite } from '../utils/product-guard';
import { dispatchWebhooks } from '../utils/webhook-dispatch';
import { createNotification } from '../utils/notifications';
import { logActivity } from '../utils/activity';
import { broadcast } from '../realtime/manager';

const TASK_INCLUDE = {
  owner: { select: { id: true, username: true, realName: true, avatarEmoji: true } },
  reviewer: { select: { id: true, username: true, realName: true, avatarEmoji: true } },
  creator: { select: { id: true, username: true, realName: true } },
  subtasks: { orderBy: { order: 'asc' as const } },
  dependsOn: { select: { prerequisiteId: true } },
  requiredBy: { select: { dependentId: true } },
};

const TASK_WHERE_ACTIVE = { deletedAt: null };

export async function taskRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;

    const { cursor, limit = '500' } = req.query as { cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit), 500);

    const tasks = await prisma.task.findMany({
      where: {
        productId,
        ...TASK_WHERE_ACTIVE,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: TASK_INCLUDE,
      orderBy: { kanbanOrder: 'asc' },
      take,
    });
    reply.send(tasks);
  });

  app.patch('/api/products/:productId/tasks/reorder', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    const { updates } = req.body as { updates: { taskId: string; order: number }[] };
    await prisma.$transaction(
      updates.map(({ taskId, order }) =>
        prisma.task.update({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE }, data: { kanbanOrder: order } }),
      ),
    );
    reply.send({ ok: true });
  });

  app.post('/api/products/:productId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    const { name, description, ownerId, reviewerId, color, deadline, canvasX, canvasY, status } = req.body as {
      name: string; description?: string; ownerId?: string; reviewerId?: string; color?: string;
      deadline?: string; canvasX?: number; canvasY?: number; status?: string;
    };
    if (!name?.trim()) return reply.status(400).send({ error: 'name required' });
    if (name.length > 200) return reply.status(400).send({ error: 'name too long (max 200)' });
    if (description && description.length > 50000) return reply.status(400).send({ error: 'description too long (max 50000)' });

    const task = await prisma.task.create({
      data: {
        productId, name: name.trim(), description, ownerId, reviewerId, color, canvasX, canvasY,
        status: status || undefined,
        deadline: deadline ? new Date(deadline) : undefined,
        createdBy: req.user.userId,
      },
      include: TASK_INCLUDE,
    });

    dispatchWebhooks(productId, 'task.created', task).catch(() => {});
    broadcast(productId, 'task.created', task);
    logActivity({ productId, actorId: req.user.userId, action: 'task.created', entityType: 'task', entityId: task.id, entityName: task.name });
    if (ownerId && ownerId !== req.user.userId) {
      createNotification({
        userId: ownerId, type: 'task_assigned', title: `You were assigned to "${task.name}"`,
        productId, taskId: task.id,
      });
    }
    if (reviewerId && reviewerId !== req.user.userId && reviewerId !== ownerId) {
      createNotification({
        userId: reviewerId, type: 'task_assigned', title: `You were set as reviewer for "${task.name}"`,
        productId, taskId: task.id,
      });
    }

    reply.status(201).send(task);
  });

  app.get('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE }, include: TASK_INCLUDE });
    if (!task) return reply.status(404).send({ error: 'Not found' });
    reply.send(task);
  });

  app.patch('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    const body = req.body as {
      name?: string; description?: string; ownerId?: string; reviewerId?: string | null; color?: string;
      deadline?: string | null; status?: string; canvasX?: number; canvasY?: number;
    };

    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } });
    if (!task) return reply.status(404).send({ error: 'Not found' });

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

    const eventName = body.status && body.status !== task.status ? 'task.status_changed' : 'task.updated';
    dispatchWebhooks(productId, eventName, updated).catch(() => {});
    broadcast(productId, eventName, updated);
    logActivity({ productId, actorId: req.user.userId, action: eventName, entityType: 'task', entityId: updated.id, entityName: updated.name });

    // Notify new assignee
    if (body.ownerId && body.ownerId !== task.ownerId && body.ownerId !== req.user.userId) {
      createNotification({
        userId: body.ownerId, type: 'task_assigned', title: `You were assigned to "${updated.name}"`,
        productId, taskId: task.id,
      });
    }
    // Notify new reviewer
    if (body.reviewerId && body.reviewerId !== task.reviewerId && body.reviewerId !== req.user.userId) {
      createNotification({
        userId: body.reviewerId, type: 'task_assigned', title: `You were set as reviewer for "${updated.name}"`,
        productId, taskId: task.id,
      });
    }

    reply.send(updated);
  });

  app.delete('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } });
    if (!task) return reply.status(404).send({ error: 'Not found' });
    // Soft delete
    await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
    dispatchWebhooks(productId, 'task.deleted', { id: taskId, name: task.name }).catch(() => {});
    broadcast(productId, 'task.deleted', { id: taskId });
    logActivity({ productId, actorId: req.user.userId, action: 'task.deleted', entityType: 'task', entityId: taskId, entityName: task.name });
    reply.send({ ok: true });
  });

  app.patch('/api/products/:productId/tasks/:taskId/position', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['canvas'], reply)) return;
    const { x, y } = req.body as { x: number; y: number };
    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } });
    if (!task) return reply.status(404).send({ error: 'Not found' });
    await prisma.task.update({ where: { id: taskId }, data: { canvasX: x, canvasY: y } });
    reply.send({ ok: true });
  });

  // ── Subtasks ──────────────────────────────────────────────────────────────

  app.post('/api/products/:productId/tasks/:taskId/subtasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    const { name } = req.body as { name: string };
    if (!name?.trim()) return reply.status(400).send({ error: 'name required' });

    const task = await prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } });
    if (!task) return reply.status(404).send({ error: 'Not found' });

    const count = await prisma.subtask.count({ where: { taskId } });
    const subtask = await prisma.subtask.create({ data: { taskId, name: name.trim(), order: count } });
    reply.status(201).send(subtask);
  });

  app.patch('/api/products/:productId/tasks/:taskId/subtasks/:subtaskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId, subtaskId } = req.params as { productId: string; taskId: string; subtaskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['kanban', 'backlog'], reply)) return;
    const { name, completed, order } = req.body as { name?: string; completed?: boolean; order?: number };

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

  // ── Dependencies ──────────────────────────────────────────────────────────

  app.post('/api/products/:productId/tasks/:taskId/dependencies', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['canvas'], reply)) return;
    const { prerequisiteId } = req.body as { prerequisiteId: string };

    const [task, prereq] = await Promise.all([
      prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } }),
      prisma.task.findFirst({ where: { id: prerequisiteId, productId, ...TASK_WHERE_ACTIVE } }),
    ]);
    if (!task || !prereq) return reply.status(404).send({ error: 'Task not found in this product' });

    // Cycle detection via recursive CTE
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE reachable AS (
        SELECT "prerequisiteId" AS id FROM "TaskDependency" WHERE "dependentId" = ${prerequisiteId}
        UNION
        SELECT td."prerequisiteId" FROM "TaskDependency" td JOIN reachable r ON td."dependentId" = r.id
      )
      SELECT id FROM reachable WHERE id = ${taskId}
    `;
    if (rows.length > 0) return reply.status(400).send({ error: 'This dependency would create a cycle' });

    try {
      await prisma.taskDependency.create({ data: { dependentId: taskId, prerequisiteId } });
      reply.status(201).send({ ok: true });
    } catch {
      reply.status(409).send({ error: 'Dependency already exists' });
    }
  });

  app.delete('/api/products/:productId/tasks/:taskId/dependencies/:prerequisiteId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId, prerequisiteId } = req.params as { productId: string; taskId: string; prerequisiteId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['canvas'], reply)) return;
    try {
      await prisma.taskDependency.delete({ where: { dependentId_prerequisiteId: { dependentId: taskId, prerequisiteId } } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.get('/api/products/:productId/graph', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const [tasks, deps] = await Promise.all([
      prisma.task.findMany({ where: { productId, ...TASK_WHERE_ACTIVE }, include: TASK_INCLUDE }),
      prisma.taskDependency.findMany({ where: { dependent: { productId, deletedAt: null } } }),
    ]);
    reply.send({ tasks, edges: deps });
  });
}
