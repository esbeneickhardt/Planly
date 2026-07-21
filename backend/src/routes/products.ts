/**
 * Project (product) routes - Create, Read, Update, Delete (CRUD) for projects within a team.
 *
 * Projects are the main workspace unit. Each project belongs to exactly one team,
 * has its own set of tasks, views (Kanban, Backlog, Gantt, Canvas), columns, sprints,
 * webhooks, and per-user tab permissions. Soft-deleted projects (deletedAt set) are
 * hidden from all queries but remain in the database (no restore path exists today).
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { getServerConfig } from '../utils/server-config';
import { validate } from '../utils/validate';
import { decryptUserPii } from '../utils/crypto';

// Validates strings as data format
const validDate = z.string().refine((s) => !isNaN(new Date(s).getTime()), 'Invalid date');

// Schema for creating a product
const createProductSchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().optional(),
  description: z.string().max(5000).optional(),
  deadline: validDate,
  teamId: z.string(),
});

// Schema for adding additional product settings
const updateProductSchema = z.object({
  name: z.string().max(100).optional(),
  emoji: z.string().optional(),
  description: z.string().max(5000).optional(),
  deadline: validDate.optional(),
  ownerId: z.string().optional(),
  analyticsEnabled: z.boolean().optional(),
});

export async function productRoutes(app: FastifyInstance) {
  // List all non-deleted projects visible to the authenticated user
  app.get('/api/products', { preHandler: requireAuth }, async (req, reply) => {
    const products = await prisma.product.findMany({
      where: { team: { members: { some: { userId: req.user.userId } } }, deletedAt: null },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    reply.send(products);
  });

  // Creating a product
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

  // Public project overview — available to any authenticated user, no membership required
  app.get('/api/products/:id/about', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true, name: true, emoji: true, description: true, deadline: true, ownerId: true,
        team: { select: { members: { include: { user: { select: { id: true, username: true, realName: true, avatarEmoji: true } } } } } },
      },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const members = product.team.members
      .map((m) => ({ userId: m.userId, role: m.userId === product.ownerId ? 'owner' : m.role, user: decryptUserPii(m.user) }))
      .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.role === 'co_owner' ? -1 : b.role === 'co_owner' ? 1 : 0));
    reply.send({ id: product.id, name: product.name, emoji: product.emoji, description: product.description, deadline: product.deadline, members });
  });

  // Get a project with full team member list (membership check included)
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

  // Updating a project
  app.patch('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = validate(updateProductSchema, req.body, reply);
    if (!body) return;
    const { name, emoji, description, deadline, ownerId, analyticsEnabled } = body;

    // Verify the caller is a member and load their role
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { team: { select: { members: { where: { userId: req.user.userId }, select: { role: true } } } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const membership = product.team.members[0];
    if (!membership) return reply.status(403).send({ error: 'Forbidden' });

    // Enforce per-field permission rules based on role
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

    // Sync team name if project name changes, then persist product fields
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

  // Soft-delete by setting deletedAt (owner only, cannot be undone via API)
  app.delete('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    if (product.ownerId !== req.user.userId) return reply.status(403).send({ error: 'Only the owner can delete this product' });
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    reply.send({ ok: true });
  });
}
