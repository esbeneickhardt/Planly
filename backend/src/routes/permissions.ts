/**
 * Tab permission routes - manage per-user, per-tab access levels within a project.
 *
 * Permission levels: 'write' (full access), 'read' (view-only), 'none' (hidden).
 * Absent row means default write. Owners and co-owners always have write regardless.
 * Tab names: kanban, backlog, gantt, canvas, messages, analytics, settings.
 * Changes are recorded in the admin audit log.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductCoOwner } from '../utils/product-guard';
import { validate } from '../utils/validate';
import { logAdminEvent } from '../utils/audit';

// Validates a batch permission update — up to 100 user+tab+level tuples per request
const permissionUpdateSchema = z
  .array(
    z.object({
      userId: z.string(),
      tab: z.enum(['kanban', 'backlog', 'gantt', 'canvas', 'messages', 'analytics', 'settings']),
      level: z.enum(['write', 'read', 'none']),
    }),
  )
  .max(100);

export async function permissionRoutes(app: FastifyInstance) {
  // Returns the authenticated user's tab permissions across all their projects (used to populate the client's permission cache)
  app.get('/api/me/permissions', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            products: {
              where: { deletedAt: null },
              include: { tabPermissions: { where: { userId } } },
            },
          },
        },
      },
    });
    // Build per-product permission map; owners/co-owners bypass explicit rows
    const result = memberships.flatMap((m) =>
      m.team.products.map((p) => {
        const role = p.ownerId === userId ? 'owner' : m.role;
        // Owners and co-owners bypass tab permissions entirely - don't expose potentially
        // stale rows that would make the display inconsistent across projects.
        const permissions =
          role === 'owner' || role === 'co_owner'
            ? {}
            : Object.fromEntries(p.tabPermissions.map((tp) => [tp.tab, tp.level]));
        return { productId: p.id, productName: p.name, productEmoji: p.emoji, role, permissions };
      }),
    );
    reply.send(result);
  });

  // Get all per-user, per-tab permission rows for a project (co-owner only)
  app.get('/api/products/:productId/permissions', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductCoOwner(productId, req.user.userId, reply))) return;
    const rows = await prisma.tabPermission.findMany({ where: { productId } });
    reply.send(rows);
  });

  // Batch-upsert tab permission rows for a project (co-owner only)
  app.put('/api/products/:productId/permissions', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const updates = validate(permissionUpdateSchema, req.body, reply);
    if (!updates) return;

    // Load product and verify the caller is owner or co-owner
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { team: { include: { members: true } } },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });
    // product.team.members is already scoped to this product's team via the Prisma query above
    const myMembership = product.team.members.find((m) => m.userId === req.user.userId);
    const canManage = product.ownerId === req.user.userId || myMembership?.role === 'co_owner';
    if (!canManage) return reply.status(403).send({ error: 'Forbidden' });

    // Reject any target user who is not a member of this project's team
    const memberUserIds = new Set(product.team.members.map((m) => m.userId));
    for (const u of updates) {
      if (!memberUserIds.has(u.userId)) {
        return reply.status(400).send({ error: `User ${u.userId} is not a member of this project` });
      }
    }

    // Upsert all permission rows atomically
    await prisma.$transaction(
      updates.map(({ userId, tab, level }) =>
        prisma.tabPermission.upsert({
          where: { productId_userId_tab: { productId, userId, tab } },
          create: { productId, userId, tab, level },
          update: { level },
        }),
      ),
    );
    logAdminEvent('PERMISSION_UPDATED', {
      actorName: req.user.username,
      targetName: productId,
      metadata: { updateCount: updates.length },
    });
    reply.send({ ok: true });
  });
}
