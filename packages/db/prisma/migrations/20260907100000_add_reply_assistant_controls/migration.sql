-- A company must explicitly opt in before any reply automation can run.
ALTER TABLE "company"
  ADD COLUMN IF NOT EXISTS "emailAssistantEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emailAssistantEnabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailAssistantLastReplyAt" TIMESTAMP(3);
