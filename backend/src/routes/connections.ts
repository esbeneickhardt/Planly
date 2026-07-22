/**
 * Connection routes - manage directed relationships between tasks on the Canvas view.
 *
 * Connections are visual edges between task nodes in the freeform Canvas.
 * They differ from Gantt dependencies (which enforce scheduling constraints) -
 * connections are purely visual and have no effect on task ordering or dates.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireTabWrite } from '../utils/product-guard';
import { handleNotFound } from '../utils/prisma-errors';
import { validate } from '../utils/validate';

// Validates the target task UUID when adding a canvas connection edge
const createConnectionSchema = z.object({ taskId: z.string().uuid() });

export async function connectionRoutes(app: FastifyInstance) {
  // List connected task IDs for a project's canvas
  app.get('/api/products/:productId/connections', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    const conns = await prisma.productConnection.findMany({ where: { productId }, select: { taskId: true } });
    reply.send(conns.map((c) => c.taskId));
  });

  // Add a canvas connection edge (idempotent upsert)
  app.post('/api/products/:productId/connections', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    if (!(await requireTabWrite(productId, req.user, ['canvas'], reply))) return;
    const body = validate(createConnectionSchema, req.body, reply);
    if (!body) return;
    const { taskId } = body;
    const task = await prisma.task.findFirst({ where: { id: taskId, productId } });
    if (!task) return reply.status(404).send({ error: 'Task not found in this product' });
    await prisma.productConnection.upsert({
      where: { productId_taskId: { productId, taskId } },
      create: { productId, taskId },
      update: {},
    });
    reply.status(201).send({ ok: true });
  });

  // Remove a canvas connection edge
  app.delete('/api/products/:productId/connections/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    if (!(await requireTabWrite(productId, req.user, ['canvas'], reply))) return;
    try {
      await prisma.productConnection.delete({ where: { productId_taskId: { productId, taskId } } });
      reply.send({ ok: true });
    } catch (e) {
      handleNotFound(e, reply);
    }
  });
}
