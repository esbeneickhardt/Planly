import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';

const finiteNumber = z.number().finite();
const positionSchema = z.record(z.string(), z.object({ x: finiteNumber, y: finiteNumber }))
  .refine((p) => Object.keys(p).length <= 5000, 'Too many positions (max 5000)');
const createSnapshotSchema = z.object({
  name: z.string().min(1).max(100),
  positions: positionSchema,
  viewport: z.object({ x: finiteNumber, y: finiteNumber, zoom: finiteNumber }),
});

export async function canvasSnapshotRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/canvas-snapshots', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const snapshots = await prisma.canvasSnapshot.findMany({
      where: { productId },
      include: { user: { select: { id: true, username: true, avatarEmoji: true } } },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(snapshots);
  });

  app.post('/api/products/:productId/canvas-snapshots', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const parsed = createSnapshotSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const { name, positions, viewport } = parsed.data;
    const snapshot = await prisma.canvasSnapshot.create({
      data: { productId, userId: req.user.userId, name, positions, viewport },
      include: { user: { select: { id: true, username: true, avatarEmoji: true } } },
    });
    reply.status(201).send(snapshot);
  });

  app.delete('/api/products/:productId/canvas-snapshots/:snapshotId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, snapshotId } = req.params as { productId: string; snapshotId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const snap = await prisma.canvasSnapshot.findFirst({ where: { id: snapshotId, productId } });
    if (!snap) return reply.status(404).send({ error: 'Not found' });
    if (snap.userId !== req.user.userId) return reply.status(403).send({ error: 'Not your snapshot' });
    await prisma.canvasSnapshot.delete({ where: { id: snapshotId } });
    reply.send({ ok: true });
  });
}
