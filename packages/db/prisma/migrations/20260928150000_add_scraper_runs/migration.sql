-- Auditable, user-triggered scraper runs. Results stay in the CRM for review;
-- importing them is a separate explicit action and never starts outreach.
CREATE TYPE "ScraperProvider" AS ENUM ('GOOGLE_MAPS', 'MINDCASE');

CREATE TYPE "ScraperRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "scraperRun" (
  "id" TEXT NOT NULL,
  "provider" "ScraperProvider" NOT NULL,
  "query" TEXT NOT NULL,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "status" "ScraperRunStatus" NOT NULL DEFAULT 'RUNNING',
  "results" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "scraperRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scraperRun_createdById_createdAt_idx"
  ON "scraperRun"("createdById", "createdAt");
CREATE INDEX "scraperRun_provider_status_createdAt_idx"
  ON "scraperRun"("provider", "status", "createdAt");

ALTER TABLE "scraperRun"
  ADD CONSTRAINT "scraperRun_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
