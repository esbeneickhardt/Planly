import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

const TASK_INCLUDE = {
  owner: { select: { id: true, username: true, avatarEmoji: true } },
  creator: { select: { id: true, username: true } },
  subtasks: { orderBy: { order: 'asc' as const } },
  dependsOn: { select: { prerequisiteId: true } },
  requiredBy: { select: { dependentId: true } },
};

export async function taskRoutes(app: FastifyInstance) {
  // List tasks for a product
  app.get('/api/products/:productId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    reply.send(await prisma.task.findMany({ where: { productId }, include: TASK_INCLUDE, orderBy: { kanbanOrder: 'asc' } }));
  });

  // Reorder tasks within / across columns
  app.patch('/api/products/:productId/tasks/reorder', { preHandler: requireAuth }, async (req, reply) => {
    const { updates } = req.body as { updates: { taskId: string; order: number }[] };
    await prisma.$transaction(
      updates.map(({ taskId, order }) =>
        prisma.task.update({ where: { id: taskId }, data: { kanbanOrder: order } }),
      ),
    );
    reply.send({ ok: true });
  });

  // Create task
  app.post('/api/products/:productId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { name, description, ownerId, color, deadline, canvasX, canvasY } = req.body as {
      name: string; description?: string; ownerId?: string; color?: string;
      deadline?: string; canvasX?: number; canvasY?: number;
    };
    if (!name) return reply.status(400).send({ error: 'name required' });

    const task = await prisma.task.create({
      data: {
        productId, name, description, ownerId, color, canvasX, canvasY,
        deadline: deadline ? new Date(deadline) : undefined,
        createdBy: req.user.userId,
      },
      include: TASK_INCLUDE,
    });
    reply.status(201).send(task);
  });

  // Get single task
  app.get('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    const task = await prisma.task.findFirst({ where: { id: taskId, productId }, include: TASK_INCLUDE });
    if (!task) return reply.status(404).send({ error: 'Not found' });
    reply.send(task);
  });

  // Update task
  app.patch('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    const body = req.body as {
      name?: string; description?: string; ownerId?: string; color?: string;
      deadline?: string | null; status?: string; canvasX?: number; canvasY?: number;
    };

    const task = await prisma.task.findFirst({ where: { id: taskId, productId } });
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
        name: body.name,
        description: body.description,
        ownerId: body.ownerId,
        color: body.color,
        status: body.status,
        canvasX: body.canvasX,
        canvasY: body.canvasY,
        deadline: body.deadline === null ? null : body.deadline ? new Date(body.deadline) : undefined,
        ...completedFields,
      },
      include: TASK_INCLUDE,
    });
    reply.send(updated);
  });

  // Delete task
  app.delete('/api/products/:productId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    const task = await prisma.task.findFirst({ where: { id: taskId, productId } });
    if (!task) return reply.status(404).send({ error: 'Not found' });
    await prisma.task.delete({ where: { id: taskId } });
    reply.send({ ok: true });
  });

  // Save canvas position
  app.patch('/api/products/:productId/tasks/:taskId/position', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    const { x, y } = req.body as { x: number; y: number };
    const task = await prisma.task.findFirst({ where: { id: taskId, productId } });
    if (!task) return reply.status(404).send({ error: 'Not found' });
    await prisma.task.update({ where: { id: taskId }, data: { canvasX: x, canvasY: y } });
    reply.send({ ok: true });
  });

  // --- Subtasks ---

  app.post('/api/products/:productId/tasks/:taskId/subtasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    const { name } = req.body as { name: string };
    if (!name) return reply.status(400).send({ error: 'name required' });

    const task = await prisma.task.findFirst({ where: { id: taskId, productId } });
    if (!task) return reply.status(404).send({ error: 'Not found' });

    const count = await prisma.subtask.count({ where: { taskId } });
    const subtask = await prisma.subtask.create({ data: { taskId, name, order: count } });
    reply.status(201).send(subtask);
  });

  app.patch('/api/products/:productId/tasks/:taskId/subtasks/:subtaskId', { preHandler: requireAuth }, async (req, reply) => {
    const { taskId, subtaskId } = req.params as { productId: string; taskId: string; subtaskId: string };
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
        data: { name, completed, order, ...completedFields },
      });
      reply.send(subtask);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/products/:productId/tasks/:taskId/subtasks/:subtaskId', { preHandler: requireAuth }, async (req, reply) => {
    const { taskId, subtaskId } = req.params as { productId: string; taskId: string; subtaskId: string };
    try {
      await prisma.subtask.delete({ where: { id: subtaskId, taskId } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // --- Dependencies (Phase 2 prep) ---

  app.post('/api/products/:productId/tasks/:taskId/dependencies', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    const { prerequisiteId } = req.body as { prerequisiteId: string };

    // Verify both tasks belong to the same product
    const [task, prereq] = await Promise.all([
      prisma.task.findFirst({ where: { id: taskId, productId } }),
      prisma.task.findFirst({ where: { id: prerequisiteId, productId } }),
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
    const { taskId, prerequisiteId } = req.params as { productId: string; taskId: string; prerequisiteId: string };
    try {
      await prisma.taskDependency.delete({ where: { dependentId_prerequisiteId: { dependentId: taskId, prerequisiteId } } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // Graph endpoint for canvas (Phase 2)
  app.get('/api/products/:productId/graph', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const [tasks, deps] = await Promise.all([
      prisma.task.findMany({ where: { productId }, include: TASK_INCLUDE }),
      prisma.taskDependency.findMany({ where: { dependent: { productId } } }),
    ]);
    reply.send({ tasks, edges: deps });
  });
}
