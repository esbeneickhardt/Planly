ALTER TABLE "IpRestriction" ADD COLUMN "listType" TEXT NOT NULL DEFAULT 'allowlist';
DROP INDEX "IpRestriction_cidr_key";
CREATE UNIQUE INDEX "IpRestriction_cidr_listType_key" ON "IpRestriction" ("cidr", "listType");

ALTER TABLE "AdminIpRestriction" ADD COLUMN "listType" TEXT NOT NULL DEFAULT 'allowlist';
DROP INDEX "AdminIpRestriction_cidr_key";
CREATE UNIQUE INDEX "AdminIpRestriction_cidr_listType_key" ON "AdminIpRestriction" ("cidr", "listType");
