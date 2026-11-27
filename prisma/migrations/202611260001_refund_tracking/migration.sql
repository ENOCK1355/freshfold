ALTER TABLE "Refund" ADD COLUMN "failureReason" TEXT, ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Refund_providerId_key" ON "Refund"("providerId");
CREATE INDEX "Refund_status_lastCheckedAt_idx" ON "Refund"("status", "lastCheckedAt");
