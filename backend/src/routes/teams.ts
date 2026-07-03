import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

const MEMBER_INCLUDE = { members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } } };

async function getTeamAdmin(teamId: string, userId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { where: { userId } },
      products: { where: { ownerId: userId }, select: { id: true } },
    },
  });
  if (!team) return null;
  const member = team.members[0];
  return {
    team,
    isMember: !!member,
    // Admin = co-owner of the team OR owner of any product in the team
    isAdmin: member?.role === 'co_owner' || team.products.length > 0,
  };
}

export async function teamRoutes(app: FastifyInstance) {
  // Only return teams the requesting user belongs to
  app.get('/api/teams', { preHandler: requireAuth }, async (req, reply) => {
    const teams = await prisma.team.findMany({
      where: { members: { some: { userId: req.user.userId } } },
      include: MEMBER_INCLUDE,
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
      include: MEMBER_INCLUDE,
    });
    reply.status(201).send(team);
  });

  app.get('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (!status.isMember) return reply.status(403).send({ error: 'Forbidden' });
    const team = await prisma.team.findUnique({ where: { id }, include: MEMBER_INCLUDE });
    reply.send(team);
  });

  app.patch('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (!status.isAdmin) return reply.status(403).send({ error: 'Only team admins can rename the team' });
    const { name } = req.body as { name?: string };
    try {
      const team = await prisma.team.update({ where: { id }, data: { name }, include: MEMBER_INCLUDE });
      reply.send(team);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  app.post('/api/teams/:id/members', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (!status.isAdmin) return reply.status(403).send({ error: 'Only team admins can add members' });
    const { userId } = req.body as { userId: string };
    try {
      await prisma.teamMember.create({ data: { teamId: id, userId } });
      reply.send({ ok: true });
    } catch {
      reply.status(409).send({ error: 'Already a member or user not found' });
    }
  });

  app.delete('/api/teams/:id/members/:userId', { preHandler: requireAuth }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    // Allow self-removal OR admin action
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (userId !== req.user.userId && !status.isAdmin) {
      return reply.status(403).send({ error: 'Only team admins can remove other members' });
    }
    try {
      await prisma.teamMember.delete({ where: { teamId_userId: { teamId: id, userId } } });
    } catch (err) {
      // P2025 = record not found - for self-removal this is fine (already gone)
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
        return reply.status(500).send({ error: 'Failed to remove member' });
      }
      if (userId !== req.user.userId) {
        return reply.status(404).send({ error: 'Member not found' });
      }
      // Self-removal when already not a member - treat as success
    }
    reply.send({ ok: true });
  });

  app.patch('/api/teams/:id/members/:userId/role', { preHandler: requireAuth }, async (req, reply) => {
    const { id: teamId, userId } = req.params as { id: string; userId: string };
    const { role } = req.body as { role: string };
    if (!['member', 'co_owner'].includes(role)) return reply.status(400).send({ error: 'Invalid role' });
    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { products: true } });
    if (!team) return reply.status(404).send({ error: 'Not found' });
    const isOwner = team.products.some(p => p.ownerId === req.user.userId);
    if (!isOwner) return reply.status(403).send({ error: 'Only the product owner can change roles' });
    await prisma.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { role: role as any } });
    reply.send({ ok: true });
  });

  app.delete('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (!status.isAdmin) return reply.status(403).send({ error: 'Only team admins can delete the team' });
    try {
      await prisma.team.delete({ where: { id } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });
}
