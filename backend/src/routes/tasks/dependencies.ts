/**
 * Task dependency routes - add/remove directed prerequisite edges between tasks, and
 * fetch the full dependency graph for canvas rendering.
 *
 * Dependencies form a DAG (directed acyclic graph). Cycle detection is enforced on every
 * add: a recursive CTE walks the existing transitive prerequisites of the proposed
 * prerequisite to confirm the dependent task is not already reachable, rejecting the edge
 * with 400 if a cycle would be created. All mutations require Canvas tab write access.
 */
import { FastifyInstance } from 'fastify';
import prisma from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { requireProductMember, requireTabWrite } from '../../utils/product-guard';
import { z } from 'zod';
import { validate } from '../../utils/validate';
import { TASK_INCLUDE, TASK_WHERE_ACTIVE } from './crud';
import { handleNotFound, handleConflict } from '../../utils/prisma-errors';

// Validates the prerequisite task ID when creating a dependency edge
const addDependencySchema = z.object({ prerequisiteId: z.string() });

export async function dependencyRoutes(app: FastifyInstance) {
  // Add a prerequisite edge from taskId ← prerequisiteId, with cycle detection
  app.post('/api/products/:productId/tasks/:taskId/dependencies', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    // requireTabWrite already re-verifies membership internally (see product-guard.ts), so a
    // preceding requireProductMember call would be pure overhead.
    if (!(await requireTabWrite(productId, req.user, ['canvas'], reply))) return;
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
    } catch (e) {
      handleConflict(e, reply, 'Dependency already exists');
    }
  });

  // Remove a prerequisite edge between two tasks
  app.delete(
    '/api/products/:productId/tasks/:taskId/dependencies/:prerequisiteId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { productId, taskId, prerequisiteId } = req.params as {
        productId: string;
        taskId: string;
        prerequisiteId: string;
      };
      if (!(await requireTabWrite(productId, req.user, ['canvas'], reply))) return;
      try {
        await prisma.taskDependency.delete({
          where: { dependentId_prerequisiteId: { dependentId: taskId, prerequisiteId } },
        });
        reply.send({ ok: true });
      } catch (e) {
        handleNotFound(e, reply);
      }
    },
  );

  // Return the full task dependency graph (nodes + edges) for canvas rendering
  app.get('/api/products/:productId/graph', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    // Load all active tasks and their dependency edges for canvas graph rendering
    const [tasks, deps] = await Promise.all([
      prisma.task.findMany({ where: { productId, ...TASK_WHERE_ACTIVE }, include: TASK_INCLUDE }),
      prisma.taskDependency.findMany({ where: { dependent: { productId, deletedAt: null } } }),
    ]);
    reply.send({ tasks, edges: deps });
  });
}
