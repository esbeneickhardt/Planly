/**
 * Team routes - CRUD for teams, member management (add/remove/role changes),
 * and access request handling.
 *
 * Teams are the top-level organizational unit. Each team owns one or more
 * projects. Roles: co_owner (full control), member (standard access), viewer (read-only).
 * Only co-owners can change team settings or manage members.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../utils/validate';
import { Prisma } from '@prisma/client';
import { handleNotFound, handleConflict } from '../utils/prisma-errors';
import { createTeamSchema, updateTeamSchema } from '../schemas/teams';
import { logAdminEvent } from '../utils/audit';

const addMemberSchema = z.object({ userId: z.string() });
const updateRoleSchema = z.object({ role: z.enum(['member', 'co_owner']) });

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
    const body = validate(createTeamSchema, req.body, reply);
    if (!body) return;
    const { name, memberIds } = body;

    // Always enroll the creator; deduplicate in case they included themselves
    const allMemberIds = Array.from(new Set([req.user.userId, ...(memberIds ?? [])]));

    const team = await prisma.team.create({
      data: {
        name,
        members: { create: allMemberIds.map((userId) => ({ userId })) },
      },
      include: MEMBER_INCLUDE,
    });
    reply.status(201).send(team);
  });

  // Get a single team (requester must be a member)
  app.get('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (!status.isMember) return reply.status(403).send({ error: 'Forbidden' });
    const team = await prisma.team.findUnique({ where: { id }, include: MEMBER_INCLUDE });
    reply.send(team);
  });

  // Rename the team (co-owners and product owners only)
  app.patch('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (!status.isAdmin) return reply.status(403).send({ error: 'Only team admins can rename the team' });
    const body = validate(updateTeamSchema, req.body, reply);
    if (!body) return;
    const { name } = body;
    try {
      const team = await prisma.team.update({ where: { id }, data: { name }, include: MEMBER_INCLUDE });
      reply.send(team);
    } catch (e) { handleNotFound(e, reply); }
  });

  // Add a user to the team (admin only)
  app.post('/api/teams/:id/members', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (!status.isAdmin) return reply.status(403).send({ error: 'Only team admins can add members' });
    const addBody = validate(addMemberSchema, req.body, reply);
    if (!addBody) return;
    const { userId } = addBody;
    try {
      const added = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      await prisma.teamMember.create({ data: { teamId: id, userId } });
      logAdminEvent('TEAM_MEMBER_ADDED', { actorName: req.user.username, targetName: added?.username, metadata: { teamId: id, userId } });
      reply.send({ ok: true });
    } catch (e) { handleConflict(e, reply, 'Already a member or user not found'); }
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
      const removed = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      await prisma.teamMember.delete({ where: { teamId_userId: { teamId: id, userId } } });
      logAdminEvent('TEAM_MEMBER_REMOVED', { actorName: req.user.username, targetName: removed?.username, metadata: { teamId: id, userId, self: userId === req.user.userId } });
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

  // Change a member's role — only product owners (not co-owners) can promote/demote
  app.patch('/api/teams/:id/members/:userId/role', { preHandler: requireAuth }, async (req, reply) => {
    const { id: teamId, userId } = req.params as { id: string; userId: string };
    const roleBody = validate(updateRoleSchema, req.body, reply);
    if (!roleBody) return;
    const { role } = roleBody;
    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { products: true } });
    if (!team) return reply.status(404).send({ error: 'Not found' });
    const isOwner = team.products.some(p => p.ownerId === req.user.userId);
    if (!isOwner) return reply.status(403).send({ error: 'Only the product owner can change roles' });
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    await prisma.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { role } });
    logAdminEvent('TEAM_MEMBER_ROLE_CHANGED', { actorName: req.user.username, targetName: target?.username, metadata: { teamId, userId, newRole: role } });
    reply.send({ ok: true });
  });

  // Delete the team and all its data (admin only)
  app.delete('/api/teams/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = await getTeamAdmin(id, req.user.userId);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    if (!status.isAdmin) return reply.status(403).send({ error: 'Only team admins can delete the team' });
    try {
      await prisma.team.delete({ where: { id } });
      reply.send({ ok: true });
    } catch (e) { handleNotFound(e, reply); }
  });
}
