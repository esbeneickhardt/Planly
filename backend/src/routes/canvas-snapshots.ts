import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function canvasSnapshotRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/canvas-snapshots', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const snapshots = await prisma.canvasSnapshot.findMany({
      where: { productId },
      include: { user: { select: { id: true, username: true, avatarEmoji: true } } },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(snapshots);
  });

  app.post('/api/products/:productId/canvas-snapshots', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { name, positions, viewport } = req.body as {
      name: string;
      positions: Record<string, { x: number; y: number }>;
      viewport: { x: number; y: number; zoom: number };
    };
    if (!name) return reply.status(400).send({ error: 'name required' });
    const snapshot = await prisma.canvasSnapshot.create({
      data: { productId, userId: req.user.userId, name, positions, viewport },
      include: { user: { select: { id: true, username: true, avatarEmoji: true } } },
    });
    reply.status(201).send(snapshot);
  });

  app.delete('/api/products/:productId/canvas-snapshots/:snapshotId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, snapshotId } = req.params as { productId: string; snapshotId: string };
    const snap = await prisma.canvasSnapshot.findFirst({ where: { id: snapshotId, productId } });
    if (!snap) return reply.status(404).send({ error: 'Not found' });
    if (snap.userId !== req.user.userId) return reply.status(403).send({ error: 'Not your snapshot' });
    await prisma.canvasSnapshot.delete({ where: { id: snapshotId } });
    reply.send({ ok: true });
  });
}
