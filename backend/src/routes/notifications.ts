import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function notificationRoutes(app: FastifyInstance) {
  // Get own notifications (newest first, unread first)
  // Optional ?productId= scopes to a specific project (plus null-productId system notifications)
  app.get('/api/notifications', { preHandler: requireAuth }, async (req, reply) => {
    const { limit = '30', cursor, productId } = req.query as { limit?: string; cursor?: string; productId?: string };
    const take = Math.min(parseInt(limit), 100);

    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user.userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
        ...(productId ? { OR: [{ productId }, { productId: null }] } : {}),
      },
      orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
      take,
    });

    reply.send({
      notifications,
      nextCursor: notifications.length === take ? notifications[notifications.length - 1].createdAt : null,
    });
  });

  // Unread count - used for the notification bell badge
  // Optional ?productId= scopes to a specific project (plus null-productId system notifications)
  app.get('/api/notifications/unread-count', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.query as { productId?: string };
    const count = await prisma.notification.count({
      where: {
        userId: req.user.userId,
        read: false,
        ...(productId ? { OR: [{ productId }, { productId: null }] } : {}),
      },
    });
    reply.send({ count });
  });

  // Mark specific notifications as read
  app.patch('/api/notifications/read', { preHandler: requireAuth }, async (req, reply) => {
    const { ids } = req.body as { ids?: string[] };
    if (!ids?.length) return reply.status(400).send({ error: 'ids required' });

    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId: req.user.userId },
      data: { read: true },
    });
    reply.send({ ok: true });
  });

  // Mark all as read
  app.post('/api/notifications/read-all', { preHandler: requireAuth }, async (req, reply) => {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, read: false },
      data: { read: true },
    });
    reply.send({ ok: true });
  });

  // Delete a notification
  app.delete('/api/notifications/:notificationId', { preHandler: requireAuth }, async (req, reply) => {
    const { notificationId } = req.params as { notificationId: string };
    await prisma.notification.deleteMany({
      where: { id: notificationId, userId: req.user.userId },
    });
    reply.send({ ok: true });
  });

  // Delete all notifications for the current user
  app.delete('/api/notifications', { preHandler: requireAuth }, async (req, reply) => {
    await prisma.notification.deleteMany({ where: { userId: req.user.userId } });
    reply.send({ ok: true });
  });
}
