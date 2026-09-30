-- Consent-gated outbound campaigns for Gmail. WhatsApp Web remains an inbound/
-- supervised pilot and is intentionally not a bulk-send channel.
CREATE TYPE "OutreachChannel" AS ENUM ('GMAIL');

CREATE TYPE "OutreachCampaignStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "OutreachItemStatus" AS ENUM (
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
  'OPTED_OUT'
);

CREATE TABLE "outreachCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "OutreachChannel" NOT NULL DEFAULT 'GMAIL',
  "status" "OutreachCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "ownerId" TEXT NOT NULL,
  "subjectTemplate" TEXT NOT NULL,
  "bodyTemplate" TEXT NOT NULL,
  "dailyLimit" INTEGER NOT NULL DEFAULT 25,
  "perMinuteLimit" INTEGER NOT NULL DEFAULT 2,
  "startsAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outreachCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outreachCampaignItem" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "companyId" TEXT,
  "contactId" TEXT,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "consentSource" TEXT NOT NULL,
  "status" "OutreachItemStatus" NOT NULL DEFAULT 'QUEUED',
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sendingAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "optedOutAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outreachCampaignItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outreachCampaignItem_idempotencyKey_key"
  ON "outreachCampaignItem"("idempotencyKey");
CREATE INDEX "outreachCampaign_ownerId_status_startsAt_idx"
  ON "outreachCampaign"("ownerId", "status", "startsAt");
CREATE INDEX "outreachCampaignItem_campaignId_status_scheduledAt_idx"
  ON "outreachCampaignItem"("campaignId", "status", "scheduledAt");
CREATE INDEX "outreachCampaignItem_recipient_status_idx"
  ON "outreachCampaignItem"("recipient", "status");
CREATE INDEX "outreachCampaignItem_companyId_idx"
  ON "outreachCampaignItem"("companyId");
CREATE INDEX "outreachCampaignItem_contactId_idx"
  ON "outreachCampaignItem"("contactId");

ALTER TABLE "outreachCampaign"
  ADD CONSTRAINT "outreachCampaign_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "outreachCampaignItem"
  ADD CONSTRAINT "outreachCampaignItem_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "outreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "outreachCampaignItem"
  ADD CONSTRAINT "outreachCampaignItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outreachCampaignItem"
  ADD CONSTRAINT "outreachCampaignItem_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
