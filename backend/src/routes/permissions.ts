import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function permissionRoutes(app: FastifyInstance) {
  // Get all tab permissions for a product (all users)
  app.get('/api/products/:productId/permissions', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const rows = await prisma.tabPermission.findMany({ where: { productId } });
    reply.send(rows);
  });

  // Upsert permissions for one or more user/tab combinations (owner or co-owner only)
  app.put('/api/products/:productId/permissions', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const updates = req.body as { userId: string; tab: string; level: string }[];

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { team: { include: { members: true } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const myMembership = product.team.members.find(m => m.userId === req.user.userId);
    const canManage = product.ownerId === req.user.userId || myMembership?.role === 'co-owner';
    if (!canManage) return reply.status(403).send({ error: 'Forbidden' });

    await prisma.$transaction(
      updates.map(({ userId, tab, level }) =>
        prisma.tabPermission.upsert({
          where: { productId_userId_tab: { productId, userId, tab } },
          create: { productId, userId, tab, level },
          update: { level },
        }),
      ),
    );
    reply.send({ ok: true });
  });
}
