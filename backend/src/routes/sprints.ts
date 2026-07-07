import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireTabRead, requireTabWrite } from '../utils/product-guard';
import { handleNotFound } from '../utils/prisma-errors';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Invalid color (expected hex e.g. #7c3aed)');
const createSprintSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid startDate'),
  endDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid endDate'),
  color: hexColor.optional(),
  taskIds: z.array(z.string()).optional(),
});
const updateSprintSchema = z.object({
  name: z.string().max(100).optional(),
  startDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid startDate').optional(),
  endDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid endDate').optional(),
  color: hexColor.optional(),
});
const sprintTasksSchema = z.object({ taskIds: z.array(z.string()).max(1000) });

const SPRINT_INCLUDE = {
  sprintTasks: { select: { taskId: true } },
};

export async function sprintRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/sprints', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabRead(productId, req.user.userId, ['kanban', 'gantt'], reply)) return;
    const sprints = await prisma.sprint.findMany({
      where: { productId },
      include: SPRINT_INCLUDE,
      orderBy: { startDate: 'asc' },
    });
    reply.send(sprints.map((s) => ({ ...s, taskIds: s.sprintTasks.map((st) => st.taskId) })));
  });

  app.post('/api/products/:productId/sprints', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireTabWrite(productId, req.user.userId, ['backlog'], reply)) return;
    const parsed = createSprintSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'name, startDate, endDate required' });
    const { name, startDate, endDate, color, taskIds } = parsed.data;

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
    if (!await requireTabWrite(productId, req.user.userId, ['backlog'], reply)) return;
    const parsed = updateSprintSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const { name, startDate, endDate, color } = parsed.data;
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
    } catch (e) { handleNotFound(e, reply, 'Sprint not found'); }
  });

  app.delete('/api/products/:productId/sprints/:sprintId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId } = req.params as { productId: string; sprintId: string };
    if (!await requireTabWrite(productId, req.user.userId, ['backlog'], reply)) return;
    try {
      await prisma.sprint.delete({ where: { id: sprintId, productId } });
      reply.send({ ok: true });
    } catch (e) { handleNotFound(e, reply, 'Sprint not found'); }
  });

  app.post('/api/products/:productId/sprints/:sprintId/tasks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, sprintId } = req.params as { productId: string; sprintId: string };
    if (!await requireTabWrite(productId, req.user.userId, ['backlog'], reply)) return;
    const parsed = sprintTasksSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'taskIds array required' });
    const { taskIds } = parsed.data;

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
    if (!await requireTabWrite(productId, req.user.userId, ['backlog'], reply)) return;
    try {
      await prisma.sprintTask.delete({ where: { sprintId_taskId: { sprintId, taskId } } });
      reply.send({ ok: true });
    } catch (e) { handleNotFound(e, reply); }
  });
}
