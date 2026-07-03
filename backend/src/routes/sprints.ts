import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';

const SPRINT_INCLUDE = {
  sprintTasks: { select: { taskId: true } },
};

export async function sprintRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/sprints', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const sprints = await prisma.sprint.findMany({
      where: { productId },
      include: SPRINT_INCLUDE,
      orderBy: { startDate: 'asc' },
    });
    reply.send(sprints.map((s) => ({ ...s, taskIds: s.sprintTasks.map((st) => st.taskId) })));
  });

  app.post('/api/products/:productId/sprints', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const { name, startDate, endDate, color, taskIds } = req.body as {
      name: string; startDate: string; endDate: string; color?: string; taskIds?: string[];
    };
    if (!name || !startDate || !endDate) return reply.status(400).send({ error: 'name, startDate, endDate required' });

    const sprint = await prisma.sprint.create({
      data: {
        productId, name,
        color: color ?? '#7c3aed',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        sprintTasks: taskIds?.length ? { create: taskIds.map((taskId) => ({ taskId })) } : undefined,
      },
      include: SPRINT_INCLUDE,
    });
    reply.status(201).send({ ...sprint, taskIds: sprint.sprintTasks.map((st) => st.taskId) });
  });

  app.patch('/api/products/:productId/sprints/:sprintId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId } = req.params as { productId: string; sprintId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const { name, startDate, endDate, color } = req.body as { name?: string; startDate?: string; endDate?: string; color?: string };
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
      reply.send({ ...sprint, taskIds: sprint.sprintTasks.map((st) => st.taskId) });
    } catch {
      reply.status(404).send({ error: 'Sprint not found' });
    }
  });

  app.delete('/api/products/:productId/sprints/:sprintId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId } = req.params as { productId: string; sprintId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    try {
      await prisma.sprint.delete({ where: { id: sprintId, productId } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Sprint not found' });
    }
  });

  app.post('/api/products/:productId/sprints/:sprintId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId } = req.params as { productId: string; sprintId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const { taskIds } = req.body as { taskIds: string[] };
    if (!Array.isArray(taskIds)) return reply.status(400).send({ error: 'taskIds array required' });

    const validTasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, productId },
      select: { id: true },
    });
    await prisma.sprintTask.createMany({
      data: validTasks.map(({ id: taskId }) => ({ sprintId, taskId })),
      skipDuplicates: true,
    });
    reply.send({ ok: true, added: validTasks.length });
  });

  app.delete('/api/products/:productId/sprints/:sprintId/tasks/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId, taskId } = req.params as { productId: string; sprintId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    try {
      await prisma.sprintTask.delete({ where: { sprintId_taskId: { sprintId, taskId } } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });
}
