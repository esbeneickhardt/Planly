import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

export async function teamRoutes(app: FastifyInstance) {
  app.get('/api/teams', { preHandler: requireAuth }, async (_req, reply) => {
    const teams = await prisma.team.findMany({
      include: { members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } } },
    });
    reply.send(teams);
  });

  app.post('/api/teams', { preHandler: requireAuth }, async (req, reply) => {
    const { name, memberIds } = req.body as { name: string; memberIds?: string[] };
    if (!name) return reply.status(400).send({ error: 'name required' });

    const team = await prisma.team.create({
      data: {
        name,
        members: memberIds?.length
          ? { create: memberIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: { members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } } },
    });
    reply.status(201).send(team);
  });

  app.get('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const team = await prisma.team.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } } },
    });
    if (!team) return reply.status(404).send({ error: 'Not found' });
    reply.send(team);
  });

  app.patch('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name } = req.body as { name?: string };
    try {
      const team = await prisma.team.update({
        where: { id },
        data: { name },
        include: { members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } } },
      });
      reply.send(team);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.post('/api/teams/:id/members', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { userId } = req.body as { userId: string };
    try {
      await prisma.teamMember.create({ data: { teamId: id, userId } });
      reply.send({ ok: true });
    } catch {
      reply.status(409).send({ error: 'Already a member or not found' });
    }
  });

  app.delete('/api/teams/:id/members/:userId', { preHandler: requireAuth }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    try {
      await prisma.teamMember.delete({ where: { teamId_userId: { teamId: id, userId } } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.team.delete({ where: { id } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });
}
