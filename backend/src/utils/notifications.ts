import prisma from '../db/client';

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  productId?: string;
  taskId?: string;
  metadata?: object;
}) {
  return prisma.notification.create({ data }).catch(() => {});
}
