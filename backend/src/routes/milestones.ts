import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function milestoneRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/milestones', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };

    const milestones = await prisma.task.findMany({
      where: { productId, deadline: { not: null } },
      include: { owner: { select: { id: true, username: true, avatarEmoji: true } } },
    });

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return reply.status(404).send({ error: 'Not found' });

    const result = await Promise.all(
      milestones.map(async (milestone) => {
        const deps = await prisma.$queryRaw<{ id: string; status: string; name: string; ownerId: string | null }[]>`
          WITH RECURSIVE reachable AS (
            SELECT "prerequisiteId" AS id FROM "TaskDependency" WHERE "dependentId" = ${milestone.id}
            UNION
            SELECT td."prerequisiteId" FROM "TaskDependency" td JOIN reachable r ON td."dependentId" = r.id
          )
          SELECT t.id, t.status, t.name, t."ownerId"
          FROM "Task" t JOIN reachable r ON t.id = r.id
        `;

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
          dependencyList: deps,
          unassignedDeps: deps.filter((d) => !d.ownerId && d.status !== 'done').length,
        };
      })
    );

    reply.send({ milestones: result, product });
  });
}
