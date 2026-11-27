CREATE TABLE "RateLimit" ("key" TEXT NOT NULL PRIMARY KEY, "n" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");
