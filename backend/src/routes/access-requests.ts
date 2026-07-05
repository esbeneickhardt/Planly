import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { createNotification } from '../utils/notifications';

export async function accessRequestRoutes(app: FastifyInstance) {
  // Discover: products the current user is NOT a member of
  // Only returns public-facing fields (name, emoji) to avoid leaking sensitive project metadata
  app.get('/api/products/discover', { preHandler: requireAuth }, async (req, reply) => {
    const products = await prisma.product.findMany({
      where: {
        team: { members: { none: { userId: req.user.userId } } },
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Also include the user's pending request status for each
    const requests = await prisma.accessRequest.findMany({
      where: { userId: req.user.userId, productId: { in: products.map((p) => p.id) } },
    });
    // Only surface 'pending' status - 'approved' is stale (user was removed) and 'rejected' should allow re-request
    const requestMap = Object.fromEntries(requests.filter((r) => r.status === 'pending').map((r) => [r.productId, r.status]));
    reply.send(products.map((p) => ({ ...p, requestStatus: requestMap[p.id] ?? null })));
  });

  // Request access to a product
  app.post('/api/products/:productId/access-requests', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { note } = req.body as { note?: string };

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { team: { include: { members: { where: { role: 'co_owner' } } } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });

    const existing = await prisma.accessRequest.findUnique({
      where: { productId_userId: { productId, userId: req.user.userId } },
    });
    if (existing) {
      // Allow re-request after rejection, or after approval if the user was subsequently removed
      const canReapply = existing.status === 'rejected' || (existing.status === 'approved' && !(await prisma.teamMember.findFirst({
        where: { userId: req.user.userId, team: { products: { some: { id: productId } } } },
      })));
      if (canReapply) {
        const updated = await prisma.accessRequest.update({
          where: { id: existing.id },
          data: { status: 'pending', note: note ?? null },
        });
        if (product.ownerId) await notifyAdmins(product.id, product.name, product.ownerId, product.team.members.map((m) => m.userId), req.user.userId, req.user.username ?? 'Someone');
        return reply.send(updated);
      }
      return reply.status(409).send({ error: 'Request already exists' });
    }
    const req2 = await prisma.accessRequest.create({
      data: { productId, userId: req.user.userId, note: note ?? null },
    });
    if (product.ownerId) await notifyAdmins(product.id, product.name, product.ownerId, product.team.members.map((m) => m.userId), req.user.userId, req.user.username ?? 'Someone');
    reply.status(201).send(req2);
  });

  async function notifyAdmins(productId: string, productName: string, ownerId: string, coOwnerIds: string[], requesterId: string, requesterName: string) {
    const adminIds = new Set([ownerId, ...coOwnerIds]);
    adminIds.delete(requesterId);
    await Promise.all([...adminIds].map((userId) =>
      createNotification({
        userId,
        type: 'access_requested',
        title: `${requesterName} requested access to "${productName}"`,
        productId,
      })
    ));
  }

  // List access requests for a product (owner or co-owner only)
  app.get('/api/products/:productId/access-requests', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { team: { include: { members: true } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const myMembership = product.team.members.find(m => m.userId === req.user.userId);
    const canManage = product.ownerId === req.user.userId || myMembership?.role === 'co_owner';
    if (!canManage) return reply.status(403).send({ error: 'Forbidden' });
    const requests = await prisma.accessRequest.findMany({
      where: { productId, status: 'pending' },
      include: { user: { select: { id: true, username: true, avatarEmoji: true, realName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    reply.send(requests);
  });

  // Approve or reject a request (owner or co-owner only)
  app.patch('/api/products/:productId/access-requests/:requestId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, requestId } = req.params as { productId: string; requestId: string };
    const { action } = req.body as { action: 'approve' | 'reject' };
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { team: { include: { members: true } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const myMembership = product.team.members.find(m => m.userId === req.user.userId);
    const canManage = product.ownerId === req.user.userId || myMembership?.role === 'co_owner';
    if (!canManage) return reply.status(403).send({ error: 'Forbidden' });
    const accessReq = await prisma.accessRequest.findFirst({ where: { id: requestId, productId } });
    if (!accessReq) return reply.status(404).send({ error: 'Not found' });

    if (action === 'approve') {
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: product.teamId, userId: accessReq.userId } },
        create: { teamId: product.teamId, userId: accessReq.userId },
        update: {},
      });
      await prisma.accessRequest.update({ where: { id: requestId }, data: { status: 'approved' } });
      createNotification({
        userId: accessReq.userId, type: 'access_approved',
        title: `Your access request to "${product.name}" was approved`,
        productId,
      });
    } else {
      await prisma.accessRequest.update({ where: { id: requestId }, data: { status: 'rejected' } });
      createNotification({
        userId: accessReq.userId, type: 'access_rejected',
        title: `Your access request to "${product.name}" was declined`,
        productId,
      });
    }
    reply.send({ ok: true });
  });
}
