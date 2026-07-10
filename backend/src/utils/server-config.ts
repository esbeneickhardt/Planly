import prisma from '../db/client';

export interface ServerConfigValues {
  requireEmailVerification: boolean;
  requireWhitelist: boolean;
  allowProjectCreation: boolean;
  announcementsEnabled: boolean;
  announcementPostRole: string;
  ipRestrictionMode: string;
}

// Reads from DB; falls back to false defaults. Cached per-request by callers.
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
