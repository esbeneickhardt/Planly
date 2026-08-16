/**
 * In-app notification utility - creates per-user notification records
 * while respecting each user's stored notification preferences.
 *
 * Notifications appear in the bell-icon dropdown and are retained for 90 days.
 * Email delivery for @mentions is handled separately in the route layer.
 * Failures are warned but never thrown.
 */
import prisma from '../db/client';
import { logger } from './logger';

// Default on/off state for each notification type when the user has not set a preference
const DEFAULT_ENABLED: Record<string, boolean> = {
  task_assigned: true,
  task_commented: true,
  mention: true,
  access_requested: true,
  access_approved: true,
  access_rejected: true,
  invite_received: true,
  role_changed: true,
  sprint_started: false, // opt-in only
  reaction: true,
};

/**
 * Creates a notification for a user if their preferences allow it.
 *
 * Checks the user's `notificationPreferences` JSON column before inserting.
 * Returns null (without error) if the user has disabled this notification type.
 *
 * @param data.type - Notification category key (must match a DEFAULT_ENABLED entry or defaults to enabled)
 * @param data.prefs - Optional pre-fetched notificationPreferences for this user (the raw JSON
 *   column value). Pass this when the caller already looked the user up for the same request
 *   (e.g. a batch @mention loop over several recipients) to skip the internal fetch below.
 *   Omit it (or pass undefined) to have this function fetch it itself, as before.
 */
export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  productId?: string;
  taskId?: string;
  metadata?: object;
  prefs?: Record<string, boolean> | null;
}) {
  const { prefs: providedPrefs, ...notificationData } = data;

  // Use the caller-supplied preferences when given; otherwise fetch them ourselves (null-safe: a
  // missing row means all defaults apply)
  let prefs = providedPrefs;
  if (prefs === undefined) {
    const user = await prisma.user
      .findUnique({
        where: { id: data.userId },
        select: { notificationPreferences: true },
      })
      .catch(() => null);
    prefs = (user?.notificationPreferences as Record<string, boolean> | null) ?? {};
  }

  // Merge stored preferences over defaults; unknown types default to enabled
  const typeDefault = DEFAULT_ENABLED[data.type] ?? true;
  const isEnabled = data.type in (prefs ?? {}) ? (prefs as Record<string, boolean>)[data.type] : typeDefault;

  if (!isEnabled) return null;

  return prisma.notification.create({ data: notificationData }).catch((err) => {
    logger.warn({ err: (err as Error).message }, 'notification write failed');
  });
}

export { DEFAULT_ENABLED };
