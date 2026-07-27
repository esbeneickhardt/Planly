/**
 * Notification types that are about chat messages rather than app events - these are excluded
 * from the notification bell (NotificationBell.tsx) and instead surface as a count on the Chat
 * button (TopBar.tsx), since a message deserves an unread-count badge, not a bell entry.
 */
export const MESSAGE_NOTIFICATION_TYPES = ['mention', 'direct_message'];
