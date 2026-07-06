import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireTabWrite } from '../utils/product-guard';

export async function connectionRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/connections', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const conns = await prisma.productConnection.findMany({ where: { productId }, select: { taskId: true } });
    reply.send(conns.map((c) => c.taskId));
  });

  app.post('/api/products/:productId/connections', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['canvas'], reply)) return;
    const { taskId } = req.body as { taskId: string };
    if (!taskId) return reply.status(400).send({ error: 'taskId required' });
    const task = await prisma.task.findFirst({ where: { id: taskId, productId } });
    if (!task) return reply.status(404).send({ error: 'Task not found in this product' });
    await prisma.productConnection.upsert({
      where: { productId_taskId: { productId, taskId } },
      create: { productId, taskId },
      update: {},
    });
    reply.status(201).send({ ok: true });
  });

  app.delete('/api/products/:productId/connections/:taskId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, taskId } = req.params as { productId: string; taskId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    if (!await requireTabWrite(productId, req.user.userId, ['canvas'], reply)) return;
    try {
      await prisma.productConnection.delete({ where: { productId_taskId: { productId, taskId } } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });
}
