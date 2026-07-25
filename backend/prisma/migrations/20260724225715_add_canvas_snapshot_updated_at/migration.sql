-- AlterTable
-- Backfill existing rows with the current timestamp; new rows always get it set explicitly by
-- Prisma's @updatedAt behavior, but the DB-level default keeps this column NOT NULL-safe either way.
ALTER TABLE "CanvasSnapshot" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
