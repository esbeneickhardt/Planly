/**
 * Activity feed routes - query the chronological event log for a project.
 *
 * Activity events are written by logActivity() throughout the app whenever a
 * significant action occurs (task created, status changed, sprint ended, etc.).
 * They are displayed in the project's activity panel and retained for 180 days.
 */
import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';

export async function activityRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/activity', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;

    // Verify the activity feed is accessible (same analytics-enabled gate as /analytics)
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { analyticsEnabled: true, ownerId: true, teamId: true },
    });
    if (!product) return reply.status(404).send({ error: 'Product not found' });
    if (!product.analyticsEnabled) {
      const isOwner = product.ownerId === req.user.userId;
      if (!isOwner) {
        const membership = await prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId: product.teamId, userId: req.user.userId } },
          select: { role: true },
        });
        if (membership?.role !== 'co_owner') {
          return reply.status(403).send({ error: 'Analytics is disabled for this project' });
        }
      }
    }

    // Paginated fetch ordered newest-first with cursor-based pagination
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
      return {
        ...e,
        metadata: { ...((e.metadata as object) ?? {}), actorName: actor?.username, actorEmoji: actor?.avatarEmoji },
      };
    });

    reply.send({
      events: enriched,
      nextCursor: events.length === take ? (events[events.length - 1]?.createdAt ?? null) : null,
    });
  });
}
