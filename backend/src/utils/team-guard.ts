/**
 * Team authorization guards - shared helper for routes that need to know whether the
 * caller is a member and/or admin of a given team.
 */
import { FastifyReply } from 'fastify';
import prisma from '../db/client';
import type { AuthPayload } from '../middleware/auth';

/**
 * Returns the team with isMember/isAdmin flags for the given user; null if the team doesn't exist.
 * Admin = co-owner of the team OR owner of any product in the team.
 */
export async function getTeamAdmin(teamId: string, userId: string) {
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
    isAdmin: member?.role === 'co_owner' || team.products.length > 0,
  };
}

// Rejects when a scoped PAT/App token tries to manage a team outside its own project. Team
// management (invite/remove/promote members, rename, delete) has no :productId in its URL, so it's
// invisible to middleware/auth.ts's global scope regex - without this, a token scoped to Project A
// could act on ANY team the underlying user administers, including deleting one entirely. Mirrors
// requireScopeMatch in product-guard.ts, but resolves scope via team membership since the URL only
// ever carries a teamId, never a productId.
export async function requireTeamScopeMatch(teamId: string, user: AuthPayload, reply: FastifyReply): Promise<boolean> {
  if (!user.scopedProductId) return true;
  const product = await prisma.product.findFirst({
    where: { id: user.scopedProductId, teamId },
    select: { id: true },
  });
  if (!product) {
    reply.status(403).send({ error: 'Token is not authorized for this team' });
    return false;
  }
  return true;
}
