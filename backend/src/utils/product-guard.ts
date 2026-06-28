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
  const product = await prisma.product.findUnique({
    where: { id: productId },
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
