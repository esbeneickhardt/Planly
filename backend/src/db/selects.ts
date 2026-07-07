/**
 * Shared Prisma select/include fragments used across multiple route files.
 * Centralising them here prevents drift when the schema changes.
 */

export const MESSAGE_AUTHOR_SELECT = {
  id: true,
  username: true,
  realName: true,
  avatarEmoji: true,
} as const;

export const MESSAGE_INCLUDE = {
  author: { select: MESSAGE_AUTHOR_SELECT },
  task: { select: { id: true, name: true } },
  reactions: { select: { emoji: true, userId: true } },
} as const;
