-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'active';
