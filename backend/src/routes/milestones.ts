/**
 * Milestone routes - query tasks that act as milestones (tasks with a deadline)
 * along with their transitive dependency progress for the Gantt view.
 *
 * Milestones are tasks that have a deadline set. A single recursive CTE fetches
 * all transitive prerequisite tasks in one DB round-trip, computes per-milestone
 * progress (done / total dependencies), and returns dependency counts for Gantt rendering.
 */
import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireTabRead } from '../utils/product-guard';

export async function milestoneRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/milestones', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabRead(productId, req.user.userId, ['gantt'], reply)) return;

    const [product, milestones] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.task.findMany({
        where: { productId, deadline: { not: null }, deletedAt: null },
        include: { owner: { select: { id: true, username: true, realName: true, avatarEmoji: true } } },
      }),
    ]);
    if (!product) return reply.status(404).send({ error: 'Not found' });
    if (milestones.length === 0) return reply.send({ milestones: [], product });

    // Fetch all transitive prerequisites for every milestone in one recursive CTE
    const milestoneIds = milestones.map((m) => m.id);

    const depRows = await prisma.$queryRaw<{ milestoneId: string; id: string; status: string; name: string; ownerId: string | null }[]>`
      WITH RECURSIVE reachable AS (
        SELECT "dependentId" AS "milestoneId", "prerequisiteId" AS id
        FROM "TaskDependency"
        WHERE "dependentId" = ANY(${milestoneIds})

        UNION

        SELECT r."milestoneId", td."prerequisiteId"
        FROM "TaskDependency" td
        JOIN reachable r ON td."dependentId" = r.id
        WHERE td."prerequisiteId" != ALL(${milestoneIds})
      )
      SELECT r."milestoneId", t.id, t.status, t.name, t."ownerId"
      FROM reachable r
      JOIN "Task" t ON t.id = r.id AND t."deletedAt" IS NULL
    `;

    // Group flat dep rows by milestone for O(n) access during result assembly
    const depsByMilestone = new Map<string, typeof depRows>();
    for (const row of depRows) {
      if (!depsByMilestone.has(row.milestoneId)) depsByMilestone.set(row.milestoneId, []);
      depsByMilestone.get(row.milestoneId)!.push(row);
    }

    // Compute progress ratios and unassigned dep counts per milestone
    const result = milestones.map((milestone) => {
      const deps = depsByMilestone.get(milestone.id) ?? [];
      const total = deps.length;
      const done = deps.filter((d) => d.status === 'done').length;
      return {
        id: milestone.id,
        name: milestone.name,
        status: milestone.status,
        deadline: milestone.deadline,
        owner: milestone.owner,
        totalDependencies: total,
        doneDependencies: done,
        progress: total > 0 ? done / total : milestone.status === 'done' ? 1 : 0,
        dependencyList: deps.map(({ id, status, name, ownerId }) => ({ id, status, name, ownerId })),
        unassignedDeps: deps.filter((d) => !d.ownerId && d.status !== 'done').length,
      };
    });

    reply.send({ milestones: result, product });
  });
}
