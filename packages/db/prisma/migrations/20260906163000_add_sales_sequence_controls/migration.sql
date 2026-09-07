-- Human-gated sales orchestration. Discovery data never authorizes sending.
CREATE TYPE "SalesSequenceStage" AS ENUM (
  'DISCOVERED',
  'CALL_PENDING',
  'INTERESTED',
  'FOLLOW_UP_ACTIVE',
  'QUALIFIED',
  'CLOSING_CALL_BOOKED',
  'PROPOSAL_SENT',
  'PAYMENT_PENDING',
  'WON',
  'LOST',
  'PAUSED'
);

CREATE TYPE "ContactChannel" AS ENUM (
  'PHONE',
  'WHATSAPP',
  'INSTAGRAM',
  'FACEBOOK',
  'LINKEDIN',
  'EMAIL',
  'WEBSITE'
);

ALTER TABLE "company"
  ADD COLUMN "salesStage" "SalesSequenceStage" NOT NULL DEFAULT 'DISCOVERED',
  ADD COLUMN "preferredContactChannel" "ContactChannel",
  ADD COLUMN "firstCallOutcome" TEXT,
  ADD COLUMN "outreachApprovedAt" TIMESTAMP(3),
  ADD COLUMN "outreachApprovedById" TEXT,
  ADD COLUMN "nextSalesActionAt" TIMESTAMP(3),
  ADD COLUMN "salesNotes" TEXT;

CREATE INDEX "company_salesStage_nextSalesActionAt_idx"
  ON "company"("salesStage", "nextSalesActionAt");
