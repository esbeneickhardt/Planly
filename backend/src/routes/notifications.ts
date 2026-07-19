/**
 * Notification routes - list, mark-read, and clear in-app notifications for the
 * authenticated user.
 *
 * Notifications are created by createNotification() throughout the app for events like
 * task assignments, @mentions, invite acceptances, and access requests. They are retained
 * for 90 days and pruned by the nightly cleanup job.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../utils/validate';

// Validates the array of notification IDs to mark as read (must have at least one)
const markReadSchema = z.object({ ids: z.array(z.string()).min(1) });

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
      nextCursor: notifications.length === take ? (notifications[notifications.length - 1]?.createdAt ?? null) : null,
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
    const body = validate(markReadSchema, req.body, reply);
    if (!body) return;
    const { ids } = body;

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
