-- AlterTable: add GitHub integration config to ServerConfig
ALTER TABLE "ServerConfig"
  ADD COLUMN "githubWebhookSecret"    TEXT,
  ADD COLUMN "githubImportIssues"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "githubImportPrs"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "githubDefaultProductId" TEXT;
