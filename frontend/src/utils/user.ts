export const displayName = (u: { realName?: string | null; username: string }): string =>
  u.realName?.trim() || u.username;
