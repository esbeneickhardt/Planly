import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function productRoutes(app: FastifyInstance) {
  app.get('/api/products', { preHandler: requireAuth }, async (_req, reply) => {
    reply.send(await prisma.product.findMany({ include: { team: { select: { id: true, name: true } } } }));
  });

  app.post('/api/products', { preHandler: requireAuth }, async (req, reply) => {
    const { name, emoji, description, deadline, teamId } = req.body as {
      name: string; emoji?: string; description?: string; deadline: string; teamId: string;
    };
    if (!name || !deadline || !teamId) return reply.status(400).send({ error: 'name, deadline and teamId required' });
    const product = await prisma.product.create({
      data: { name, emoji, description, deadline: new Date(deadline), teamId },
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
    reply.send(product);
  });

  app.patch('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, emoji, description, deadline } = req.body as {
      name?: string; emoji?: string; description?: string; deadline?: string;
    };
    try {
      const product = await prisma.product.update({
        where: { id },
        data: { name, emoji, description, ...(deadline ? { deadline: new Date(deadline) } : {}) },
        include: { team: { select: { id: true, name: true } } },
      });
      reply.send(product);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.product.delete({ where: { id } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });
}
