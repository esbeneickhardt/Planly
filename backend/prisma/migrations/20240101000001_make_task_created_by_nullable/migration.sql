-- AlterTable: make Task.createdBy nullable so user deletion (GDPR erasure)
-- sets it to NULL via onDelete: SetNull instead of cascading or erroring.
ALTER TABLE "Task" ALTER COLUMN "createdBy" DROP NOT NULL;
