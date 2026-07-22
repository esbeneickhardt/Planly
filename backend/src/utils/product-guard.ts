/**
 * Product (project) authorization guards - reusable preHandler helpers that
 * check membership and tab-level permissions before allowing route handlers to run.
 *
 * Permission model:
 *   - Owner and co-owners always have full write access to every tab.
 *   - Regular members default to write access unless a TabPermission row says otherwise.
 *   - Explicit 'none' level completely hides a tab from a member.
 *   - Absent row = write (default); 'read' = view-only; 'write' = full access.
 *
 * App Registration tokens bypass the human membership check: if the token is
 * scoped to this product, the app is treated as a standalone member whose tab
 * access is governed by the permissions stored on the AppRegistration itself.
 * An absent entry in app.permissions defaults to 'write'.
 * App tokens never satisfy requireProductCoOwner — that gate is for humans only.
 */
import { FastifyReply } from 'fastify';
import type { AuthPayload } from '../middleware/auth';
import prisma from '../db/client';

/**
 * Verifies that the caller is a member of the team that owns `productId`.
 * For app tokens scoped to this product the membership DB check is skipped —
 * the token scope itself is the proof of authorisation.
 * Sends 404 or 403 and returns false when access is denied.
 */
export async function requireProductMember(
  productId: string,
  user: AuthPayload,
  reply: FastifyReply,
): Promise<boolean> {
  // App token scoped to this product — skip creator membership check
  if (user.appName && user.scopedProductId === productId) {
    const exists = await prisma.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } });
    if (!exists) {
      reply.status(404).send({ error: 'Not found' });
      return false;
    }
    return true;
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      team: {
        select: {
          members: { where: { userId: user.userId }, select: { userId: true } },
        },
      },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  if (product.team.members.length === 0) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

/**
 * Verifies that the caller has write-level access to at least one of the given tabs.
 * For app tokens the check is against the app's own permissions, not the creator's.
 * An absent entry in app permissions defaults to 'write'.
 * Sends 403 and returns false on deny.
 */
export async function requireTabWrite(
  productId: string,
  user: AuthPayload,
  tabs: string[],
  reply: FastifyReply,
): Promise<boolean> {
  // App token — use the app's own per-tab permissions; absent entry defaults to write
  if (user.appName && user.scopedProductId === productId) {
    const perms = user.appPermissions ?? {};
    const hasWrite = tabs.some((tab) => (perms[tab] ?? 'write') === 'write');
    if (!hasWrite) {
      reply.status(403).send({ error: 'Write access required' });
      return false;
    }
    return true;
  }

  const { userId } = user;
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  if (product.ownerId === userId) return true;

  const member = product.team.members[0];
  if (!member) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  if (member.role === 'co_owner') return true;

  const rows = await prisma.tabPermission.findMany({
    where: { productId, userId, tab: { in: tabs } },
    select: { tab: true, level: true },
  });

  const hasWrite = tabs.some((tab) => {
    const row = rows.find((r) => r.tab === tab);
    return !row || row.level === 'write';
  });

  if (!hasWrite) {
    reply.status(403).send({ error: 'Write access required' });
    return false;
  }
  return true;
}

/**
 * Verifies that the caller has at least read-level access (not 'none') on at
 * least one of the given tabs.
 * For app tokens the check is against the app's own permissions; absent entry defaults to 'write'.
 * Sends 403 and returns false on deny.
 */
export async function requireTabRead(
  productId: string,
  user: AuthPayload,
  tabs: string[],
  reply: FastifyReply,
): Promise<boolean> {
  // App token — use the app's own per-tab permissions; absent entry defaults to write
  if (user.appName && user.scopedProductId === productId) {
    const perms = user.appPermissions ?? {};
    const canRead = tabs.some((tab) => (perms[tab] ?? 'write') !== 'none');
    if (!canRead) {
      reply.status(403).send({ error: 'Access denied' });
      return false;
    }
    return true;
  }

  const { userId } = user;
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  if (product.ownerId === userId) return true;

  const member = product.team.members[0];
  if (!member) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  if (member.role === 'co_owner') return true;

  const rows = await prisma.tabPermission.findMany({
    where: { productId, userId, tab: { in: tabs } },
    select: { tab: true, level: true },
  });

  const canRead = tabs.some((tab) => {
    const row = rows.find((r) => r.tab === tab);
    return !row || row.level !== 'none';
  });

  if (!canRead) {
    reply.status(403).send({ error: 'Access denied' });
    return false;
  }
  return true;
}

/**
 * Verifies that the caller is the owner or a co-owner of `productId`.
 * App tokens never satisfy this guard — project management operations require a human.
 * Sends 404/403 and returns false on deny.
 */
export async function requireProductCoOwner(productId: string, userId: string, reply: FastifyReply): Promise<boolean> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  if (product.ownerId === userId) return true;

  const member = product.team.members[0];
  if (member?.role === 'co_owner') return true;

  reply.status(403).send({ error: 'Forbidden' });
  return false;
}
