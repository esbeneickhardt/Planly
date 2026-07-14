/**
 * Returns the user's display name, preferring `realName` over `username`.
 * Trims whitespace so a name of only spaces falls back to the username.
 */
export const displayName = (u: { realName?: string | null; username: string }): string =>
  u.realName?.trim() || u.username;
