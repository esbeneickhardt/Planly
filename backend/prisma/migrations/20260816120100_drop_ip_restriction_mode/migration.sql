-- AlterTable
-- Drops ServerConfig.ipRestrictionMode: it was read into ServerConfigValues but never actually
-- consulted by any enforcement code - IP restriction logic (src/routes/ip-restrictions.ts,
-- src/middleware/auth.ts's requireAdmin, and the global preHandler hook in src/index.ts) reads
-- the IpRestriction/AdminIpRestriction allow/block-list tables directly instead.
ALTER TABLE "ServerConfig" DROP COLUMN "ipRestrictionMode";
