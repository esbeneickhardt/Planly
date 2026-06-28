import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';

export async function activityRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/activity', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;

    const { cursor, limit = '50' } = req.query as { cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit), 100);

    const events = await prisma.activityEvent.findMany({
      where: {
        productId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    // Enrich with actor usernames
    const actorIds = [...new Set(events.map((e) => e.actorId))];
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, username: true, avatarEmoji: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const enriched = events.map((e) => {
      const actor = actorMap.get(e.actorId);
      return { ...e, metadata: { ...(e.metadata as object ?? {}), actorName: actor?.username, actorEmoji: actor?.avatarEmoji } };
    });

    reply.send({
      events: enriched,
      nextCursor: events.length === take ? events[events.length - 1].createdAt : null,
    });
  });
}
