/**
 * Task dependency routes - add/remove DAG edges between tasks, and fetch the full graph.
 * Cycle detection uses a single recursive CTE in one DB round-trip.
 */
import { FastifyInstance } from 'fastify';
import prisma from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { requireProductMember, requireTabWrite } from '../../utils/product-guard';
import { z } from 'zod';
import { validate } from '../../utils/validate';
import { TASK_INCLUDE, TASK_WHERE_ACTIVE } from './crud';

const addDependencySchema = z.object({ prerequisiteId: z.string() });

export async function dependencyRoutes(app: FastifyInstance) {
  app.post('/api/products/:productId/tasks/:taskId/dependencies', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['canvas'], reply)) return;
    const depBody = validate(addDependencySchema, req.body, reply);
    if (!depBody) return;
    const { prerequisiteId } = depBody;

    // Verify both tasks exist and belong to this product
    const [task, prereq] = await Promise.all([
      prisma.task.findFirst({ where: { id: taskId, productId, ...TASK_WHERE_ACTIVE } }),
      prisma.task.findFirst({ where: { id: prerequisiteId, productId, ...TASK_WHERE_ACTIVE } }),
    ]);
    if (!task || !prereq) return reply.status(404).send({ error: 'Task not found in this product' });

    // Cycle detection via recursive CTE — rejects the edge if taskId is reachable from prerequisiteId
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
    // Load all active tasks and their dependency edges for canvas graph rendering
    const [tasks, deps] = await Promise.all([
      prisma.task.findMany({ where: { productId, ...TASK_WHERE_ACTIVE }, include: TASK_INCLUDE }),
      prisma.taskDependency.findMany({ where: { dependent: { productId, deletedAt: null } } }),
    ]);
    reply.send({ tasks, edges: deps });
  });
}
