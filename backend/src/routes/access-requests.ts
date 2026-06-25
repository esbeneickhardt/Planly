import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function accessRequestRoutes(app: FastifyInstance) {
  // Discover: products the current user is NOT a member of
  app.get('/api/products/discover', { preHandler: requireAuth }, async (req, reply) => {
    const products = await prisma.product.findMany({
      where: {
        team: { members: { none: { userId: req.user.userId } } },
      },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Also include the user's pending request status for each
    const requests = await prisma.accessRequest.findMany({
      where: { userId: req.user.userId, productId: { in: products.map((p) => p.id) } },
    });
    const requestMap = Object.fromEntries(requests.map((r) => [r.productId, r.status]));
    reply.send(products.map((p) => ({ ...p, requestStatus: requestMap[p.id] ?? null })));
  });

  // Request access to a product
  app.post('/api/products/:productId/access-requests', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { note } = req.body as { note?: string };
    const existing = await prisma.accessRequest.findUnique({
      where: { productId_userId: { productId, userId: req.user.userId } },
    });
    if (existing) {
      if (existing.status === 'rejected') {
        // Allow re-request after rejection
        const updated = await prisma.accessRequest.update({
          where: { id: existing.id },
          data: { status: 'pending', note: note ?? null },
        });
        return reply.send(updated);
      }
      return reply.status(409).send({ error: 'Request already exists' });
    }
    const req2 = await prisma.accessRequest.create({
      data: { productId, userId: req.user.userId, note: note ?? null },
    });
    reply.status(201).send(req2);
  });

  // List access requests for a product (owner or co-owner only)
  app.get('/api/products/:productId/access-requests', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { team: { include: { members: true } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const myMembership = product.team.members.find(m => m.userId === req.user.userId);
    const canManage = product.ownerId === req.user.userId || myMembership?.role === 'co-owner';
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
    const canManage = product.ownerId === req.user.userId || myMembership?.role === 'co-owner';
    if (!canManage) return reply.status(403).send({ error: 'Forbidden' });
    const accessReq = await prisma.accessRequest.findFirst({ where: { id: requestId, productId } });
    if (!accessReq) return reply.status(404).send({ error: 'Not found' });

    if (action === 'approve') {
      // Add to team
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: product.teamId, userId: accessReq.userId } },
        create: { teamId: product.teamId, userId: accessReq.userId },
        update: {},
      });
      await prisma.accessRequest.update({ where: { id: requestId }, data: { status: 'approved' } });
    } else {
      await prisma.accessRequest.update({ where: { id: requestId }, data: { status: 'rejected' } });
    }
    reply.send({ ok: true });
  });
}
