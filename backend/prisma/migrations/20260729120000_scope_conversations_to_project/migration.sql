-- Scope non-admin conversations (DMs and groups) to the project they belong to, so chat can no
-- longer bleed across projects. Admin-chat conversations (isAdminChat = true) are left untouched
-- (productId stays NULL) since server admins are allowed to contact anyone directly.

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "productId" TEXT;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Conversation_productId_isAdminChat_idx" ON "Conversation"("productId", "isAdminChat");

-- Best-effort backfill for existing non-admin conversations created before this scoping existed:
-- for each one, find every active (non-deleted) project whose team contains ALL of its
-- participants. If exactly one such project exists, assign it. Ambiguous conversations (no
-- matching project, or more than one) are left with productId = NULL, which the app now treats
-- as "not visible under any project" - safer than guessing wrong and leaving cross-project chat
-- leakage in place.
WITH conv_size AS (
  SELECT "conversationId", COUNT(*)::int AS n
  FROM "ConversationParticipant"
  GROUP BY "conversationId"
),
matches AS (
  SELECT
    cp."conversationId",
    p.id AS product_id,
    COUNT(*)::int AS matched
  FROM "ConversationParticipant" cp
  JOIN "TeamMember" tm ON tm."userId" = cp."userId"
  JOIN "Product" p ON p."teamId" = tm."teamId" AND p."deletedAt" IS NULL
  GROUP BY cp."conversationId", p.id
),
full_matches AS (
  SELECT m."conversationId", m.product_id
  FROM matches m
  JOIN conv_size s ON s."conversationId" = m."conversationId"
  WHERE m.matched = s.n
),
unique_matches AS (
  SELECT "conversationId", MIN(product_id) AS product_id
  FROM full_matches
  GROUP BY "conversationId"
  HAVING COUNT(*) = 1
)
UPDATE "Conversation" c
SET "productId" = um.product_id
FROM unique_matches um
WHERE c.id = um."conversationId" AND c."isAdminChat" = false;
