import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { getServerConfig } from '../utils/server-config';
import { validate } from '../utils/validate';

const validDate = z.string().refine((s) => !isNaN(new Date(s).getTime()), 'Invalid date');

const createProductSchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().optional(),
  description: z.string().max(5000).optional(),
  deadline: validDate,
  teamId: z.string(),
});
const updateProductSchema = z.object({
  name: z.string().max(100).optional(),
  emoji: z.string().optional(),
  description: z.string().max(5000).optional(),
  deadline: validDate.optional(),
  ownerId: z.string().optional(),
  analyticsEnabled: z.boolean().optional(),
});

export async function productRoutes(app: FastifyInstance) {
  app.get('/api/products', { preHandler: requireAuth }, async (req, reply) => {
    const products = await prisma.product.findMany({
      where: { team: { members: { some: { userId: req.user.userId } } }, deletedAt: null },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    reply.send(products);
  });

  app.post('/api/products', { preHandler: requireAuth }, async (req, reply) => {
    const body = validate(createProductSchema, req.body, reply);
    if (!body) return;
    const { name, emoji, description, deadline, teamId } = body;

    // Check server-level project creation permission (admins are always allowed)
    const requestingUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!requestingUser?.isAdmin) {
      const cfg = await getServerConfig();
      if (!cfg.allowProjectCreation) return reply.status(403).send({ error: 'Project creation is restricted to admins on this server.' });
    }

    // Verify the requester is a member of the target team
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: req.user.userId } },
    });
    if (!membership) return reply.status(403).send({ error: 'Not a member of this team' });

    const product = await prisma.product.create({
      data: { name, emoji, description, deadline: new Date(deadline), teamId, ownerId: req.user.userId },
      include: { team: { select: { id: true, name: true } } },
    });
    reply.status(201).send(product);
  });

  app.get('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { team: { include: { members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } } } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const isMember = product.team.members.some(m => m.userId === req.user.userId);
    if (!isMember) return reply.status(403).send({ error: 'Forbidden' });
    reply.send(product);
  });

  app.patch('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const { name, emoji, description, deadline, ownerId, analyticsEnabled } = parsed.data;

    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { team: { select: { members: { where: { userId: req.user.userId }, select: { role: true } } } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const membership = product.team.members[0];
    if (!membership) return reply.status(403).send({ error: 'Forbidden' });

    const isProductOwner = product.ownerId === req.user.userId;
    const isCoOwner = membership.role === 'co_owner';

    if ((name !== undefined || emoji !== undefined || description !== undefined) && !isProductOwner && !isCoOwner) {
      return reply.status(403).send({ error: 'Only the owner or co-owners can update project details' });
    }
    if (ownerId !== undefined && !isProductOwner) {
      return reply.status(403).send({ error: 'Only the owner can transfer ownership' });
    }
    if (ownerId !== undefined) {
      const newOwnerMembership = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: product.teamId, userId: ownerId } },
      });
      if (!newOwnerMembership) return reply.status(400).send({ error: 'New owner must be a team member' });
    }
    if (analyticsEnabled !== undefined && !isProductOwner) {
      return reply.status(403).send({ error: 'Only the owner can change analytics visibility' });
    }

    try {
      if (name !== undefined) {
        await prisma.team.update({ where: { id: product.teamId }, data: { name } });
      }
      const updated = await prisma.product.update({
        where: { id },
        data: {
          name, emoji, description,
          ...(deadline ? { deadline: new Date(deadline) } : {}),
          ...(ownerId !== undefined ? { ownerId } : {}),
          ...(analyticsEnabled !== undefined ? { analyticsEnabled } : {}),
        },
        include: { team: { select: { id: true, name: true } } },
      });
      reply.send(updated);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    if (product.ownerId !== req.user.userId) return reply.status(403).send({ error: 'Only the owner can delete this product' });
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    reply.send({ ok: true });
  });
}
