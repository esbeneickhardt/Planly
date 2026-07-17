/**
 * Shared Prisma select/include fragments used across multiple route files.
 * Centralising them here prevents drift when the schema changes and avoids
 * subtle inconsistencies where different routes return different author fields.
 */

// Minimal author fields returned alongside every message
export const MESSAGE_AUTHOR_SELECT = {
  id: true,
  username: true,
  realName: true,
  avatarEmoji: true,
  isAdmin: true,
  isFoundingAdmin: true,
} as const;

export const MESSAGE_INCLUDE = {
  author: { select: MESSAGE_AUTHOR_SELECT },
  task: { select: { id: true, name: true } },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: { select: { id: true, content: true, author: { select: MESSAGE_AUTHOR_SELECT } } },
} as const;
