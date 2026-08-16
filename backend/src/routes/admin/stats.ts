/**
 * Admin stats, project listing, deleted-project restore, and project-chat proxy routes.
 * /api/admin/projects returns a denormalized list (owner, member count, task count) for the admin dashboard.
 * /api/admin/projects/deleted returns soft-deleted projects; /api/admin/products/:id/restore revives one.
 * /api/admin/stats returns aggregate counts for the last 30 days alongside all-time totals.
 * /api/admin/products/:id/messages lets admins read and write into any project's chat.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth';
import { revokeProjectTokens } from '../../utils/product-guard';
import { logAdminEvent } from '../../utils/audit';
import prisma from '../../db/client';
import { decryptMessageAuthor } from '../../utils/crypto';
import { broadcast } from '../../realtime/manager';
import { validate } from '../../utils/validate';

// Author fields included in admin-proxied project chat messages
const ADMIN_MSG_AUTHOR_SELECT = {
  id: true,
  username: true,
  realName: true,
  avatarEmoji: true,
  isAdmin: true,
  isFoundingAdmin: true,
};
// Role badge values an admin can claim when posting into a project chat via the admin panel
const VALID_ROLES = ['Server Owner', 'Server Admin', 'Project Owner', 'Project Co-Owner'] as const;
// Message payload for the admin-proxy post-to-project-chat endpoint
const adminMsgSendSchema = z.object({
  content: z.string().min(1).max(10000),
  postedAsRole: z.enum(VALID_ROLES).nullable().optional(),
});
// Payload for the admin project-status override endpoint
const productStatusSchema = z.object({ status: z.enum(['active', 'completed', 'archived']) });

export async function adminStatsRoutes(app: FastifyInstance) {
  // List all active projects with owner details, member count, and task count for the admin dashboard
  app.get('/api/admin/projects', { preHandler: requireAdmin }, async (_req, reply) => {
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        emoji: true,
        description: true,
        deadline: true,
        createdAt: true,
        ownerId: true,
        teamId: true,
        status: true,
        ownerUser: { select: { username: true, avatarEmoji: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
        team: { select: { _count: { select: { members: true } }, members: { select: { userId: true, role: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        description: p.description,
        deadline: p.deadline,
        createdAt: p.createdAt,
        ownerId: p.ownerId ?? null,
        teamId: p.teamId,
        status: p.status,
        ownerUsername: p.ownerUser?.username ?? null,
        ownerEmoji: p.ownerUser?.avatarEmoji ?? null,
        memberCount: p.team._count.members,
        taskCount: p._count.tasks,
        teamMembers: p.team.members,
      })),
    );
  });

  // Set any project's status regardless of team membership - the owner/co-owner-gated version on
  // the regular product route can't be used here since an admin reviewing the platform-wide
  // project list is very often not a member of the project's own team at all.
  app.patch('/api/admin/products/:id/status', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = validate(productStatusSchema, req.body, reply);
    if (!body) return;
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    await prisma.product.update({ where: { id }, data: { status: body.status } });

    // Entering a locked state revokes every API/app token scoped to this project - see
    // revokeProjectTokens for why this is what keeps the read-only lockdown actually enforced.
    const revoked =
      body.status !== product.status && (body.status === 'completed' || body.status === 'archived')
        ? await revokeProjectTokens(id)
        : 0;

    logAdminEvent('PRODUCT_STATUS_CHANGED', {
      actorName: req.user.username,
      targetName: product.name,
      metadata: { productId: id, status: body.status, revokedTokens: revoked },
    });
    reply.send({ ok: true });
  });

  // List soft-deleted projects so admins can review before hard-deleting or restoring
  app.get('/api/admin/projects/deleted', { preHandler: requireAdmin }, async (_req, reply) => {
    const products = await prisma.product.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        emoji: true,
        deletedAt: true,
        createdAt: true,
        ownerUser: { select: { username: true, avatarEmoji: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
        team: { select: { _count: { select: { members: true } } } },
      },
      orderBy: { deletedAt: 'desc' },
    });
    reply.send(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        deletedAt: p.deletedAt,
        createdAt: p.createdAt,
        ownerUsername: p.ownerUser?.username ?? null,
        ownerEmoji: p.ownerUser?.avatarEmoji ?? null,
        memberCount: p.team._count.members,
        taskCount: p._count.tasks,
      })),
    );
  });

  // Restore a soft-deleted project by clearing its deletedAt timestamp
  app.post('/api/admin/products/:id/restore', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return reply.status(404).send({ error: 'Project not found' });
    if (!product.deletedAt) return reply.status(409).send({ error: 'Project is not deleted' });
    await prisma.product.update({ where: { id }, data: { deletedAt: null } });
    logAdminEvent('PRODUCT_RESTORED', {
      actorName: req.user.username,
      targetName: product.name,
      metadata: { productId: id },
    });
    reply.send({ ok: true });
  });

  // Hard-delete a soft-deleted project and all its data (admin only, irreversible)
  app.delete('/api/admin/products/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return reply.status(404).send({ error: 'Project not found' });
    if (!product.deletedAt)
      return reply.status(409).send({ error: 'Project must be soft-deleted before it can be permanently removed' });
    await prisma.product.delete({ where: { id } });
    logAdminEvent('PRODUCT_HARD_DELETED', {
      actorName: req.user.username,
      targetName: product.name,
      metadata: { productId: id },
    });
    reply.send({ ok: true });
  });

  // Admin can read any project chat
  app.get('/api/admin/products/:id/messages', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const messages = await prisma.message.findMany({
      where: { productId: id, taskId: null },
      include: { author: { select: ADMIN_MSG_AUTHOR_SELECT }, reactions: true },
      orderBy: { createdAt: 'asc' },
    });
    reply.send({ messages: messages.map(decryptMessageAuthor) });
  });

  // Admin can post into any project chat
  app.post('/api/admin/products/:id/messages', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = validate(adminMsgSendSchema, req.body, reply);
    if (!body) return;
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    const [sender, coOwnerMembership] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { isAdmin: true, isFoundingAdmin: true },
      }),
      // Co-ownership is a team-level TeamRole (see product-guard.ts), so check it against the
      // team that owns this specific project - needed for the Project Co-Owner claim below.
      prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: product.teamId, userId: req.user.userId } },
      }),
    ]);
    let postedAsRole: string | null = body.postedAsRole ?? null;
    if (postedAsRole === 'Server Owner' && !sender?.isFoundingAdmin) postedAsRole = null;
    if (postedAsRole === 'Server Admin' && !sender?.isAdmin) postedAsRole = null;
    // An admin proxy-posting into a project's chat can only claim Project Owner/Co-Owner if
    // they genuinely hold that role on THIS specific project - being a server admin does not
    // imply either.
    if (postedAsRole === 'Project Owner' && product.ownerId !== req.user.userId) postedAsRole = null;
    if (postedAsRole === 'Project Co-Owner' && coOwnerMembership?.role !== 'co_owner') postedAsRole = null;
    const msg = await prisma.message.create({
      data: {
        productId: id,
        taskId: null,
        authorId: req.user.userId,
        content: body.content.trim(),
        attachments: [],
        postedAsRole,
      },
      include: { author: { select: ADMIN_MSG_AUTHOR_SELECT }, reactions: true },
    });
    const decryptedMsg = decryptMessageAuthor(msg);
    broadcast(id, 'message.created', decryptedMsg);
    reply.status(201).send(decryptedMsg);
  });

  // Return server-wide aggregate stats: all-time totals plus last-30-day new counts
  app.get('/api/admin/stats', { preHandler: requireAdmin }, async (_req, reply) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Run all six counts in parallel to minimise latency
    const [userCount, projectCount, taskCount, messageCount, newUsers, newProjects] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.task.count({ where: { deletedAt: null } }),
      prisma.message.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.product.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
    ]);
    reply.send({ userCount, projectCount, taskCount, messageCount, newUsers, newProjects });
  });
}
