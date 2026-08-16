/**
 * Team authorization guards - shared helper for routes that need to know whether the
 * caller is a member and/or admin of a given team.
 */
import prisma from '../db/client';

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
