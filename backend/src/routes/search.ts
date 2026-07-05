import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function searchRoutes(app: FastifyInstance) {
  // Search across all products the user is a member of
  app.get('/api/search', { preHandler: requireAuth }, async (req, reply) => {
    const { q, productId, limit = '20' } = req.query as { q?: string; productId?: string; limit?: string };
    const query = q?.trim();
    if (!query || query.length < 2) return reply.status(400).send({ error: 'Query must be at least 2 characters' });

    const take = Math.min(parseInt(limit), 50);

    // Find all products the user belongs to (optionally scoped to one)
    const memberProducts = await prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(productId ? { id: productId } : {}),
        team: { members: { some: { userId: req.user.userId } } },
      },
      select: { id: true, name: true, emoji: true },
    });
    const productIds = memberProducts.map((p) => p.id);
    const productMap = Object.fromEntries(memberProducts.map((p) => [p.id, p]));

    if (productIds.length === 0) return reply.send({ tasks: [], messages: [] });

    const [tasks, subtaskParents, messages] = await Promise.all([
      prisma.task.findMany({
        where: {
          productId: { in: productIds },
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: { owner: { select: { id: true, username: true, realName: true, avatarEmoji: true } } },
        orderBy: { updatedAt: 'desc' },
        take,
      }),
      // Find tasks whose subtasks match the query
      prisma.task.findMany({
        where: {
          productId: { in: productIds },
          deletedAt: null,
          subtasks: {
            some: {
              name: { contains: query, mode: 'insensitive' },
            },
          },
        },
        include: { owner: { select: { id: true, username: true, realName: true, avatarEmoji: true } } },
        orderBy: { updatedAt: 'desc' },
        take: Math.floor(take / 2),
      }),
      prisma.message.findMany({
        where: {
          productId: { in: productIds },
          content: { contains: query, mode: 'insensitive' },
        },
        include: {
          author: { select: { id: true, username: true, realName: true, avatarEmoji: true } },
          task: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.floor(take / 2),
      }),
    ]);

    // Merge top-level tasks and parents-of-matching-subtasks (deduplicate by id)
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    for (const t of subtaskParents) {
      if (!taskMap.has(t.id)) taskMap.set(t.id, t);
    }
    const allTasks = [...taskMap.values()];

    reply.send({
      tasks: allTasks.map((t) => ({ ...t, product: productMap[t.productId] })),
      messages: messages.filter((m) => m.productId).map((m) => ({ ...m, product: productMap[m.productId!] })),
    });
  });
}
