/**
 * Activity event logger - records per-project user actions for the activity feed.
 *
 * Activity events power the "recent activity" panel visible to all project members.
 * They are retained for 180 days and pruned by the nightly cleanup job.
 * Failures are warned but never thrown - a logging failure must not break the request.
 */
import prisma from '../db/client';
import { logger } from './logger';

/**
 * Records a user action in a project's activity feed. Fire-and-forget safe.
 *
 * @param data.productId - Project the action occurred in
 * @param data.actorId - User who performed the action
 * @param data.action - Action verb (e.g. 'task.created', 'task.status_changed')
 * @param data.entityType - Type of the affected entity ('task', 'column', 'sprint', …)
 * @param data.entityId - ID of the affected entity
 * @param data.entityName - Human-readable name (for display in the feed without a join)
 * @param data.metadata - Additional structured context
 */
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
    logger.warn({ err: (err as Error).message }, 'activity write failed');
  });
}

/**
 * Same as logActivity, but for recording many events in a single write (e.g. a bulk task
 * update/delete looping over affected entities) instead of one `create` call per entity.
 * Fire-and-forget safe, same as logActivity.
 */
export async function logActivityBatch(events: Parameters<typeof logActivity>[0][]) {
  if (events.length === 0) return;
  return prisma.activityEvent.createMany({ data: events }).catch((err) => {
    logger.warn({ err: (err as Error).message, count: events.length }, 'activity batch write failed');
  });
}
