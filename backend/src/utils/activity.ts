import prisma from '../db/client';

export async function logActivity(data: {
  productId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  metadata?: object;
}) {
  return prisma.activityEvent.create({ data }).catch((err) => {
    console.warn('[activity] Failed to log activity event:', (err as Error).message);
  });
}
