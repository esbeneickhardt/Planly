-- Add type field to EmailWhitelist to support deny (blacklist) rules alongside allow rules
ALTER TABLE "EmailWhitelist" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'allow';
