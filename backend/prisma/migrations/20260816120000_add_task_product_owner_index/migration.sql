-- CreateIndex
-- Speeds up the personal-workload analytics queries (src/routes/analytics.ts's
-- GET /api/products/:productId/analytics/workload), which filter on the combination of
-- productId + ownerId three times (active-status groupBy, recent-completions findMany, and
-- an all-time completed count) - previously served only by the separate single-column
-- productId and ownerId indexes.
CREATE INDEX "Task_productId_ownerId_idx" ON "Task"("productId", "ownerId");
