import { FastifyReply } from 'fastify';
import prisma from '../db/client';

/**
 * Verifies that `userId` is a member of the team that owns `productId`.
 * Sends 404 or 403 and returns false when access is denied.
 */
export async function requireProductMember(
  productId: string,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      team: {
        select: {
          members: { where: { userId }, select: { userId: true } },
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
 * Verifies that `userId` has write-level access to at least one of the given
 * tabs on `productId`. Owners and co-owners always pass. Regular members pass
 * only when no explicit permission row exists (defaults to write) OR an
 * explicit row with level='write' exists. Sends 403 and returns false on deny.
 */
export async function requireTabWrite(
  productId: string,
  userId: string,
  tabs: string[],
  reply: FastifyReply,
): Promise<boolean> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: {
        select: {
          members: { where: { userId }, select: { role: true } },
        },
      },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }

  // Owner always has write
  if (product.ownerId === userId) return true;

  const member = product.team.members[0];
  if (!member) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }

  // Co-owner always has write
  if (member.role === 'co_owner') return true;

  // Check explicit tab permissions - no row means default write
  const rows = await prisma.tabPermission.findMany({
    where: { productId, userId, tab: { in: tabs } },
    select: { tab: true, level: true },
  });

  const hasWrite = tabs.some((tab) => {
    const row = rows.find((r) => r.tab === tab);
    return !row || row.level === 'write'; // absent = write (default)
  });

  if (!hasWrite) {
    reply.status(403).send({ error: 'Write access required' });
    return false;
  }

  return true;
}

/**
 * Verifies that `userId` has at least read-level access (not 'none') on at
 * least one of the given tabs. Owners and co-owners always pass. Regular
 * members pass unless every specified tab has an explicit 'none' row.
 * Sends 403 and returns false on deny.
 */
export async function requireTabRead(
  productId: string,
  userId: string,
  tabs: string[],
  reply: FastifyReply,
): Promise<boolean> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: {
        select: {
          members: { where: { userId }, select: { role: true } },
        },
      },
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

  // Can read if any tab is absent (default write) or explicitly read/write
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
 * Verifies that `userId` is the owner or a co-owner of `productId`.
 * Regular members are rejected. Sends 404/403 and returns false on deny.
 */
export async function requireProductCoOwner(
  productId: string,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: {
        select: {
          members: { where: { userId }, select: { role: true } },
        },
      },
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
