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
import { requireTabRead, requireTabWrite } from '../utils/product-guard';
import { validate } from '../utils/validate';

// Canvas snapshots are governed by the 'canvas' tab, same as connections.ts (Canvas edges) -
// see product-guard.ts's requireTabRead/requireTabWrite for the underlying permission model.
const CANVAS_TAB = ['canvas'];

// Rejects Infinity/NaN so canvas coordinates can be safely stored and rendered
const finiteNumber = z.number().finite();
// Maps task IDs to (x, y) coordinates; capped at 5000 to prevent giant payloads
const positionSchema = z
  .record(z.string(), z.object({ x: finiteNumber, y: finiteNumber }))
  .refine((p) => Object.keys(p).length <= 5000, 'Too many positions (max 5000)');
// Viewport (pan + zoom) plus the display/filter state active when the snapshot was taken, so
// loading it restores the same view - not just node positions. Kept as an explicit, closed shape
// (not .passthrough()) so unrecognized keys are still rejected rather than silently accumulating.
const viewportSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  zoom: finiteNumber,
  viewMode: z.enum(['all', 'active', 'milestones', 'sprint']).optional(),
  simpleMode: z.boolean().optional(),
  statusFilter: z.string().nullable().optional(),
  selectedSprintFilter: z.string().nullable().optional(),
  selectedMilestoneIds: z.array(z.string()).max(5000).optional(),
});
// Full snapshot payload: positions map plus the viewport/filter state
const createSnapshotSchema = z.object({
  name: z.string().min(1).max(100),
  positions: positionSchema,
  viewport: viewportSchema,
});
// Update payload: same shape, but name is optional since an update may only refresh positions/viewport
const updateSnapshotSchema = createSnapshotSchema.partial({ name: true });

export async function canvasSnapshotRoutes(app: FastifyInstance) {
  // List all canvas snapshots for a project
  app.get('/api/products/:productId/canvas-snapshots', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    // requireTabRead already re-verifies membership internally (see product-guard.ts), so a
    // preceding requireProductMember call would be pure overhead - matches columns.ts's pattern.
    if (!(await requireTabRead(productId, req.user, CANVAS_TAB, reply))) return;
    const snapshots = await prisma.canvasSnapshot.findMany({
      where: { productId },
      include: {
        user: { select: { id: true, username: true, avatarEmoji: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    reply.send(snapshots);
  });

  // Save a new canvas snapshot (positions + viewport)
  app.post('/api/products/:productId/canvas-snapshots', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireTabWrite(productId, req.user, CANVAS_TAB, reply))) return;

    // Enforce max snapshot limit per project (mirrors the per-project/per-user caps used
    // elsewhere - webhooks: 20, API tokens: 25, subtasks: 500 per task).
    const snapshotCount = await prisma.canvasSnapshot.count({
      where: { productId },
    });
    if (snapshotCount >= 50)
      return reply.status(400).send({
        error: 'Maximum 50 canvas snapshots allowed per project. Delete an existing snapshot first.',
      });

    const body = validate(createSnapshotSchema, req.body, reply);
    if (!body) return;
    const { name, positions, viewport } = body;
    const snapshot = await prisma.canvasSnapshot.create({
      data: { productId, userId: req.user.userId, name, positions, viewport },
      include: {
        user: { select: { id: true, username: true, avatarEmoji: true } },
      },
    });
    reply.status(201).send(snapshot);
  });

  // Update own snapshot in place (author only) - lets a creator refresh their saved layout with
  // the current positions/viewport/filters instead of always having to save a new one.
  app.patch(
    '/api/products/:productId/canvas-snapshots/:snapshotId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { productId, snapshotId } = req.params as {
        productId: string;
        snapshotId: string;
      };
      if (!(await requireTabWrite(productId, req.user, CANVAS_TAB, reply))) return;
      const snap = await prisma.canvasSnapshot.findFirst({
        where: { id: snapshotId, productId },
      });
      if (!snap) return reply.status(404).send({ error: 'Not found' });
      if (snap.userId !== req.user.userId) return reply.status(403).send({ error: 'Not your snapshot' });
      const body = validate(updateSnapshotSchema, req.body, reply);
      if (!body) return;
      const updated = await prisma.canvasSnapshot.update({
        where: { id: snapshotId },
        data: body,
        include: {
          user: { select: { id: true, username: true, avatarEmoji: true } },
        },
      });
      reply.send(updated);
    },
  );

  // Delete own snapshot (author only)
  app.delete(
    '/api/products/:productId/canvas-snapshots/:snapshotId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { productId, snapshotId } = req.params as {
        productId: string;
        snapshotId: string;
      };
      if (!(await requireTabWrite(productId, req.user, CANVAS_TAB, reply))) return;
      const snap = await prisma.canvasSnapshot.findFirst({
        where: { id: snapshotId, productId },
      });
      if (!snap) return reply.status(404).send({ error: 'Not found' });
      if (snap.userId !== req.user.userId) return reply.status(403).send({ error: 'Not your snapshot' });
      await prisma.canvasSnapshot.delete({ where: { id: snapshotId } });
      reply.status(204).send();
    },
  );
}
