import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';

export async function permissionRoutes(app: FastifyInstance) {
  // Returns the authenticated user's permissions across all their projects
  app.get('/api/me/permissions', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            products: {
              where: { deletedAt: null },
              include: { tabPermissions: { where: { userId } } },
            },
          },
        },
      },
    });
    const result = memberships.flatMap((m) =>
      m.team.products.map((p) => {
        const role = p.ownerId === userId ? 'owner' : m.role;
        // Owners and co-owners bypass tab permissions entirely — don't expose potentially
        // stale rows that would make the display inconsistent across projects.
        const permissions =
          role === 'owner' || role === 'co_owner'
            ? {}
            : Object.fromEntries(p.tabPermissions.map((tp) => [tp.tab, tp.level]));
        return { productId: p.id, productName: p.name, productEmoji: p.emoji, role, permissions };
      }),
    );
    reply.send(result);
  });

  app.get('/api/products/:productId/permissions', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const rows = await prisma.tabPermission.findMany({ where: { productId } });
    reply.send(rows);
  });

  app.put('/api/products/:productId/permissions', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const updates = req.body as { userId: string; tab: string; level: string }[];

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { team: { include: { members: true } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const myMembership = product.team.members.find(m => m.userId === req.user.userId);
    const canManage = product.ownerId === req.user.userId || myMembership?.role === 'co_owner';
    if (!canManage) return reply.status(403).send({ error: 'Forbidden' });

    await prisma.$transaction(
      updates.map(({ userId, tab, level }) =>
        prisma.tabPermission.upsert({
          where: { productId_userId_tab: { productId, userId, tab } },
          create: { productId, userId, tab, level: level as any },
          update: { level: level as any },
        }),
      ),
    );
    reply.send({ ok: true });
  });
}
