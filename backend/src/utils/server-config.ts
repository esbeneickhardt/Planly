/**
 * Server configuration accessor - reads the singleton `ServerConfig` row from the database.
 * All feature flags that admins control at runtime (email verification, whitelisting,
 * project creation, announcements) live in this row. Missing values fall back to safe defaults
 * so a fresh install works without any admin setup.
 */

import prisma from '../db/client';

export interface ServerConfigValues {
  requireEmailVerification: boolean;
  requireWhitelist: boolean;
  requireBlocklist: boolean;
  allowProjectCreation: boolean;
  announcementsEnabled: boolean;
  announcementPostRole: string;
  ipRestrictionMode: string;
  requireMfa: boolean;
}

// 5-second in-memory TTL cache — eliminates repeated DB hits on every authenticated request
// while keeping config changes visible within a few seconds
let _cache: { value: ServerConfigValues; expiresAt: number } | null = null;

/** Returns the singleton ServerConfig row, using a 5-second in-memory cache to reduce DB load. */
export async function getServerConfig(): Promise<ServerConfigValues> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) return _cache.value;
  const row = await prisma.serverConfig.findUnique({ where: { id: 'main' } });
  const value: ServerConfigValues = {
    requireEmailVerification: row?.requireEmailVerification ?? false,
    requireWhitelist: row?.requireWhitelist ?? false,
    requireBlocklist: row?.requireBlocklist ?? false,
    allowProjectCreation: row?.allowProjectCreation ?? true,
    announcementsEnabled: row?.announcementsEnabled ?? false,
    announcementPostRole: row?.announcementPostRole ?? 'admin',
    ipRestrictionMode: row?.ipRestrictionMode ?? 'disabled',
    requireMfa: row?.requireMfa ?? false,
  };
  _cache = { value, expiresAt: now + 5_000 };
  return value;
}

/** Call after an admin writes a new config so the cache doesn't serve stale data. */
export function invalidateServerConfigCache() {
  _cache = null;
}
