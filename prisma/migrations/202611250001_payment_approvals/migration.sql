ALTER TABLE "Payment" ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewedBy" TEXT, ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "periodDaysSnapshot" INTEGER NOT NULL DEFAULT 30, ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewedBy" TEXT, ADD COLUMN "reviewNote" TEXT;
UPDATE "Subscription" SET "periodDaysSnapshot" = GREATEST(1, ROUND(EXTRACT(EPOCH FROM ("endsAt" - "startsAt")) / 86400)::INTEGER);
