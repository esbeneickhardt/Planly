import prisma from '../db/client';

const DEFAULT_ENABLED: Record<string, boolean> = {
  task_assigned:    true,
  task_commented:   true,
  mention:          true,
  access_requested: true,
  access_approved:  true,
  access_rejected:  true,
  invite_received:  true,
  sprint_started:   false, // opt-in
};

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  productId?: string;
  taskId?: string;
  metadata?: object;
}) {
  // Check user's notification preferences before creating
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { notificationPreferences: true },
  }).catch(() => null);

  const prefs = (user?.notificationPreferences as Record<string, boolean> | null) ?? {};
  const typeDefault = DEFAULT_ENABLED[data.type] ?? true;
  const isEnabled = data.type in prefs ? prefs[data.type] : typeDefault;

  if (!isEnabled) return null;

  return prisma.notification.create({ data }).catch((err) => {
    console.warn('[notifications] Failed to create notification:', (err as Error).message);
  });
}

export { DEFAULT_ENABLED };
