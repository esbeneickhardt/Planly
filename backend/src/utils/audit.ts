import prisma from '../db/client';
import { Prisma } from '@prisma/client';

export function logAdminEvent(action: string, opts: { actorName?: string; targetName?: string; metadata?: Prisma.InputJsonValue } = {}) {
  return prisma.adminLog.create({ data: { action, actorName: opts.actorName, targetName: opts.targetName, metadata: opts.metadata } })
    .catch((err: Error) => { console.warn(`[audit] Failed to write ${action} log:`, err.message); });
}
