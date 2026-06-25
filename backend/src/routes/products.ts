import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function productRoutes(app: FastifyInstance) {
  app.get('/api/products', { preHandler: requireAuth }, async (req, reply) => {
    const products = await prisma.product.findMany({
      where: { team: { members: { some: { userId: req.user.userId } } } },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    reply.send(products);
  });

  app.post('/api/products', { preHandler: requireAuth }, async (req, reply) => {
    const { name, emoji, description, deadline, teamId } = req.body as {
      name: string; emoji?: string; description?: string; deadline: string; teamId: string;
    };
    if (!name || !deadline || !teamId) return reply.status(400).send({ error: 'name, deadline and teamId required' });
    const product = await prisma.product.create({
      data: { name, emoji, description, deadline: new Date(deadline), teamId, ownerId: req.user.userId },
      include: { team: { select: { id: true, name: true } } },
    });
    reply.status(201).send(product);
  });

  app.get('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({
      where: { id },
      include: { team: { include: { members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } } } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const isMember = product.team.members.some(m => m.userId === req.user.userId);
    if (!isMember) return reply.status(403).send({ error: 'Not a member of this project' });
    reply.send(product);
  });

  app.patch('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, emoji, description, deadline, ownerId } = req.body as {
      name?: string; emoji?: string; description?: string; deadline?: string; ownerId?: string;
    };
    try {
      const product = await prisma.product.update({
        where: { id },
        data: { name, emoji, description, ...(deadline ? { deadline: new Date(deadline) } : {}), ...(ownerId !== undefined ? { ownerId } : {}) },
        include: { team: { select: { id: true, name: true } } },
      });
      reply.send(product);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    if (product.ownerId !== req.user.userId) return reply.status(403).send({ error: 'Only the owner can delete this product' });
    await prisma.product.delete({ where: { id } });
    reply.send({ ok: true });
  });
}
