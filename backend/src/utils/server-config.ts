import prisma from '../db/client';

export interface ServerConfigValues {
  requireEmailVerification: boolean;
  requireWhitelist: boolean;
}

// Reads from DB; falls back to false defaults. Cached per-request by callers.
export async function getServerConfig(): Promise<ServerConfigValues> {
  const row = await prisma.serverConfig.findUnique({ where: { id: 'main' } });
  return {
    requireEmailVerification: row?.requireEmailVerification ?? false,
    requireWhitelist: row?.requireWhitelist ?? false,
  };
}
