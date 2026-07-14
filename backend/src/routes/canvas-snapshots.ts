/**
 * Canvas snapshot routes - persist and retrieve task node positions on the
 * Canvas (freeform planning) view.
 *
 * A snapshot stores a map of { taskId → { x, y } } positions for a project.
 * The entire position map is replaced on each save (one snapshot per project).
 * Positions are bounded to finite numbers and the map is limited to 5000 entries.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember } from '../utils/product-guard';
import { validate } from '../utils/validate';

const finiteNumber = z.number().finite();
const positionSchema = z.record(z.string(), z.object({ x: finiteNumber, y: finiteNumber }))
  .refine((p) => Object.keys(p).length <= 5000, 'Too many positions (max 5000)');
const createSnapshotSchema = z.object({
  name: z.string().min(1).max(100),
  positions: positionSchema,
  viewport: z.object({ x: finiteNumber, y: finiteNumber, zoom: finiteNumber }),
});

export async function canvasSnapshotRoutes(app: FastifyInstance) {
  // List all canvas snapshots for a project
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

  // Save a new canvas snapshot (positions + viewport)
  app.post('/api/products/:productId/canvas-snapshots', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const body = validate(createSnapshotSchema, req.body, reply);
    if (!body) return;
    const { name, positions, viewport } = body;
    const snapshot = await prisma.canvasSnapshot.create({
      data: { productId, userId: req.user.userId, name, positions, viewport },
      include: { user: { select: { id: true, username: true, avatarEmoji: true } } },
    });
    reply.status(201).send(snapshot);
  });

  // Delete own snapshot (author only)
  app.delete('/api/products/:productId/canvas-snapshots/:snapshotId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, snapshotId } = req.params as { productId: string; snapshotId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const snap = await prisma.canvasSnapshot.findFirst({ where: { id: snapshotId, productId } });
    if (!snap) return reply.status(404).send({ error: 'Not found' });
    if (snap.userId !== req.user.userId) return reply.status(403).send({ error: 'Not your snapshot' });
    await prisma.canvasSnapshot.delete({ where: { id: snapshotId } });
    reply.status(204).send();
  });
}
