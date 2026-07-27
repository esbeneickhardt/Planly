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
// Optional type scoping for read-all - omitted means "all types", matching prior behavior
const readAllSchema = z.object({
  types: z.array(z.string()).min(1).optional(),
  excludeTypes: z.array(z.string()).min(1).optional(),
});

// Parses a comma-separated `?types=a,b` / `?excludeTypes=a,b` query param into a string array
function parseTypesParam(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const types = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return types.length > 0 ? types : undefined;
}

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

  // Unread count - used for the notification bell badge (and, scoped with ?types=, the Chat
  // button's own badge for message-related notifications the bell no longer shows)
  // Optional ?productId= scopes to a specific project (plus null-productId system notifications)
  // Optional ?types= / ?excludeTypes= (comma-separated) narrow which notification types count
  app.get('/api/notifications/unread-count', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, types, excludeTypes } = req.query as {
      productId?: string;
      types?: string;
      excludeTypes?: string;
    };
    const includeTypes = parseTypesParam(types);
    const omitTypes = parseTypesParam(excludeTypes);
    const count = await prisma.notification.count({
      where: {
        userId: req.user.userId,
        read: false,
        ...(productId ? { OR: [{ productId }, { productId: null }] } : {}),
        ...(includeTypes ? { type: { in: includeTypes } } : {}),
        ...(omitTypes ? { type: { notIn: omitTypes } } : {}),
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

  // Mark all as read - optional body `{ types }` scopes this to specific notification types
  // (e.g. clearing just the message-related ones when the Chat panel is opened), omitted means
  // all types, matching prior behavior
  app.post('/api/notifications/read-all', { preHandler: requireAuth }, async (req, reply) => {
    const body = validate(readAllSchema, req.body ?? {}, reply);
    if (!body) return;
    await prisma.notification.updateMany({
      where: {
        userId: req.user.userId,
        read: false,
        ...(body.types ? { type: { in: body.types } } : {}),
        ...(body.excludeTypes ? { type: { notIn: body.excludeTypes } } : {}),
      },
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
