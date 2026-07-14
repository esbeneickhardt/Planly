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
  allowProjectCreation: boolean;
  announcementsEnabled: boolean;
  announcementPostRole: string;
  ipRestrictionMode: string;
}

// Reads from DB; safe defaults keep the app functional on a fresh install
// Callers that call this multiple times per request should cache the result themselves
export async function getServerConfig(): Promise<ServerConfigValues> {
  const row = await prisma.serverConfig.findUnique({ where: { id: 'main' } });
  return {
    requireEmailVerification: row?.requireEmailVerification ?? false,
    requireWhitelist: row?.requireWhitelist ?? false,
    allowProjectCreation: row?.allowProjectCreation ?? true,
    announcementsEnabled: row?.announcementsEnabled ?? false,
    announcementPostRole: row?.announcementPostRole ?? 'admin',
    ipRestrictionMode: row?.ipRestrictionMode ?? 'disabled',
  };
}
