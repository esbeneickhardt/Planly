-- Rename ProductStatus 'cancelled' -> 'archived' (relabels existing rows automatically, no backfill needed)
ALTER TYPE "ProductStatus" RENAME VALUE 'cancelled' TO 'archived';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- Backfill from lastLoginAt so existing users don't all show "Never" until their next request
UPDATE "User" SET "lastActiveAt" = "lastLoginAt" WHERE "lastLoginAt" IS NOT NULL;
