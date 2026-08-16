/**
 * Project (product) routes - Create, Read, Update, Delete (CRUD) for projects within a team.
 *
 * Projects are the main workspace unit. Each project belongs to exactly one team,
 * has its own set of tasks, views (Kanban, Backlog, Gantt, Canvas), columns, sprints,
 * webhooks, and per-user tab permissions. Soft-deleted projects (deletedAt set) are
 * hidden from all queries but remain in the database - an admin can restore one via
 * POST /api/admin/products/:id/restore (see admin/stats.ts) or permanently remove it
 * via DELETE /api/admin/products/:id.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { getServerConfig } from '../utils/server-config';
import { validate } from '../utils/validate';
import { revokeProjectTokens } from '../utils/product-guard';
import { logAdminEvent } from '../utils/audit';
import { handleNotFound } from '../utils/prisma-errors';

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
  discoverable: z.boolean().optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
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
      if (!cfg.allowProjectCreation)
        return reply.status(403).send({ error: 'Project creation is restricted to admins on this server.' });
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

  // Public project overview — available to any authenticated user, no membership required.
  // Because there's no membership check, the member list here must stay at the same PII level as
  // the other no-membership-required project listing (GET /api/products/discover, in
  // access-requests.ts): username/emoji only, never decrypted realName. Contrast with
  // GET /api/products/:id below, which DOES require membership but still only selects
  // {id, username, avatarEmoji} for the same reason - realName is only ever returned to callers
  // with an explicit reason to see it (e.g. access-requests.ts's co-owner-only request list).
  app.get('/api/products/:id/about', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        emoji: true,
        description: true,
        deadline: true,
        ownerId: true,
        status: true,
        team: {
          select: {
            members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } },
          },
        },
      },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const members = product.team.members
      .map((m) => ({
        userId: m.userId,
        role: m.userId === product.ownerId ? 'owner' : m.role,
        user: m.user,
      }))
      .sort((a, b) =>
        a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.role === 'co_owner' ? -1 : b.role === 'co_owner' ? 1 : 0,
      );
    reply.send({
      id: product.id,
      name: product.name,
      emoji: product.emoji,
      description: product.description,
      deadline: product.deadline,
      members,
    });
  });

  // Get a project with full team member list (membership check included)
  app.get('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        team: {
          include: { members: { include: { user: { select: { id: true, username: true, avatarEmoji: true } } } } },
        },
      },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const isMember = product.team.members.some((m) => m.userId === req.user.userId);
    if (!isMember) return reply.status(403).send({ error: 'Forbidden' });
    reply.send(product);
  });

  // Updating a project
  app.patch('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = validate(updateProductSchema, req.body, reply);
    if (!body) return;
    const { name, emoji, description, deadline, ownerId, analyticsEnabled, discoverable, status } = body;

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

    // 'archived' locks out everyone, including the owner, from every field except `status`
    // itself - status must stay editable or archiving would be a one-way trap with no revert path.
    const touchesNonStatusField =
      name !== undefined ||
      emoji !== undefined ||
      description !== undefined ||
      deadline !== undefined ||
      ownerId !== undefined ||
      analyticsEnabled !== undefined ||
      discoverable !== undefined;
    if (product.status === 'archived' && touchesNonStatusField) {
      return reply.status(403).send({ error: 'This project is archived - only its status can be changed.' });
    }

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
    if (discoverable !== undefined && !isProductOwner) {
      return reply.status(403).send({ error: 'Only the owner can change project discoverability' });
    }
    if (status !== undefined && !isProductOwner && !isCoOwner) {
      return reply.status(403).send({ error: 'Only the owner or co-owners can change project status' });
    }

    // Sync team name if project name changes, then persist product fields
    try {
      if (name !== undefined) {
        await prisma.team.update({ where: { id: product.teamId }, data: { name } });
      }
      const updated = await prisma.product.update({
        where: { id },
        data: {
          name,
          emoji,
          description,
          ...(deadline ? { deadline: new Date(deadline) } : {}),
          ...(ownerId !== undefined ? { ownerId } : {}),
          ...(analyticsEnabled !== undefined ? { analyticsEnabled } : {}),
          ...(discoverable !== undefined ? { discoverable } : {}),
          ...(status !== undefined ? { status } : {}),
        },
        include: { team: { select: { id: true, name: true } } },
      });

      // Entering a locked state revokes every API/app token scoped to this project, so a live
      // token can never bypass the read-only lockdown (see revokeProjectTokens for why the
      // permission checks themselves don't need their own app-token special case).
      if (status !== undefined && status !== product.status && (status === 'completed' || status === 'archived')) {
        const revoked = await revokeProjectTokens(id);
        logAdminEvent('PRODUCT_STATUS_CHANGED', {
          actorName: req.user.username,
          targetName: product.name,
          metadata: { productId: id, status, revokedTokens: revoked },
        });
      }

      reply.send(updated);
    } catch (e) {
      handleNotFound(e, reply);
    }
  });

  // Duplicate a project as a fresh template - owner only (stricter than the co-owner-friendly
  // rules above, since this spins up a whole new team/project rather than editing the existing
  // one). Copies the task/dependency/subtask structure, canvas layout, kanban columns, and color
  // legend, but otherwise starts completely clean: a brand new team with only the duplicating
  // user as a member (none of the source project's other members), no sub-plans, no
  // webhooks/API tokens, no chat history, no tab permissions, and every task reset to its default
  // status. Every deadline is shifted forward by the same offset (anchored on the new product's
  // own deadline landing ~2 years out) so the whole timeline moves into the future while
  // preserving how far apart milestones were from each other and from the project deadline,
  // rather than collapsing every date onto the same far-future point.
  app.post('/api/products/:id/duplicate', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const source = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        tasks: { where: { deletedAt: null }, include: { subtasks: true, dependsOn: true } },
        kanbanColumns: true,
        colorLegendEntries: true,
      },
    });
    if (!source) return reply.status(404).send({ error: 'Not found' });
    if (source.ownerId !== req.user.userId) {
      return reply.status(403).send({ error: 'Only the owner can duplicate this project' });
    }

    // Same server-level project-creation gate as creating a brand-new project from scratch.
    const requestingUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!requestingUser?.isAdmin) {
      const cfg = await getServerConfig();
      if (!cfg.allowProjectCreation)
        return reply.status(403).send({ error: 'Project creation is restricted to admins on this server.' });
    }

    const FAR_FUTURE_YEARS = 2;
    const newDeadline = new Date(source.deadline);
    newDeadline.setFullYear(newDeadline.getFullYear() + FAR_FUTURE_YEARS);
    const deltaMs = newDeadline.getTime() - source.deadline.getTime();

    const created = await prisma.$transaction(async (tx) => {
      // Mirrors the frontend's own "create team, then create product in it" flow for a normal
      // new project (see ProductContext.tsx's createProduct) - the new team's only member is
      // whoever duplicated the project, exactly like starting a brand-new one.
      const team = await tx.team.create({
        data: { name: `${source.name} Team`, members: { create: [{ userId: req.user.userId }] } },
      });

      const product = await tx.product.create({
        data: {
          name: `${source.name} (Copy)`,
          emoji: source.emoji,
          description: source.description,
          deadline: newDeadline,
          teamId: team.id,
          ownerId: req.user.userId,
          analyticsEnabled: source.analyticsEnabled,
        },
      });

      if (source.kanbanColumns.length > 0) {
        await tx.kanbanColumn.createMany({
          data: source.kanbanColumns.map((c) => ({
            productId: product.id,
            label: c.label,
            color: c.color,
            order: c.order,
            isDone: c.isDone,
            statusKey: c.statusKey,
          })),
        });
      }

      if (source.colorLegendEntries.length > 0) {
        await tx.colorLegendEntry.createMany({
          data: source.colorLegendEntries.map((e) => ({
            productId: product.id,
            colorKey: e.colorKey,
            name: e.name,
            enabled: e.enabled,
          })),
        });
      }

      // Created one at a time (not createMany) so each new id is known immediately - needed to
      // remap dependency edges and subtasks to the copied tasks below.
      const idMap = new Map<string, string>();
      for (const t of source.tasks) {
        const copy = await tx.task.create({
          data: {
            productId: product.id,
            name: t.name,
            description: t.description,
            status: 'backlog',
            color: t.color,
            deadline: t.deadline ? new Date(t.deadline.getTime() + deltaMs) : null,
            canvasX: t.canvasX,
            canvasY: t.canvasY,
            kanbanOrder: t.kanbanOrder,
            milestoneOrder: t.milestoneOrder,
            createdBy: req.user.userId,
          },
        });
        idMap.set(t.id, copy.id);
      }

      const subtaskRows = source.tasks.flatMap((t) =>
        t.subtasks.map((s) => ({ taskId: idMap.get(t.id)!, name: s.name, completed: false, order: s.order })),
      );
      if (subtaskRows.length > 0) await tx.subtask.createMany({ data: subtaskRows });

      const dependencyRows = source.tasks.flatMap((t) =>
        t.dependsOn.map((d) => ({
          dependentId: idMap.get(d.dependentId)!,
          prerequisiteId: idMap.get(d.prerequisiteId)!,
        })),
      );
      if (dependencyRows.length > 0) await tx.taskDependency.createMany({ data: dependencyRows });

      return product;
    });

    const full = await prisma.product.findUnique({
      where: { id: created.id },
      include: { team: { select: { id: true, name: true } } },
    });
    reply.status(201).send(full);
  });

  // Soft-delete by setting deletedAt (owner only). Not reversible by the owner via this API, but
  // an admin can restore it via POST /api/admin/products/:id/restore (see admin/stats.ts).
  app.delete('/api/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    if (product.ownerId !== req.user.userId)
      return reply.status(403).send({ error: 'Only the owner can delete this product' });
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    reply.send({ ok: true });
  });
}
