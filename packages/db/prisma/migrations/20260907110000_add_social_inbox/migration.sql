CREATE TYPE "SocialChannel" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'FACEBOOK');

CREATE TABLE "socialThread" (
  "id" TEXT NOT NULL, "channel" "SocialChannel" NOT NULL,
  "externalThreadId" TEXT NOT NULL, "externalSenderId" TEXT NOT NULL,
  "externalRecipientId" TEXT, "companyId" TEXT, "contactId" TEXT,
  "firstMessageAt" TIMESTAMP(3) NOT NULL, "lastMessageAt" TIMESTAMP(3) NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "socialThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "socialMessage" (
  "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "externalMessageId" TEXT NOT NULL,
  "direction" "EmailDirection" NOT NULL, "senderId" TEXT NOT NULL,
  "body" TEXT, "raw" JSONB NOT NULL, "sentAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "socialMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "socialThread_channel_externalThreadId_key" ON "socialThread"("channel", "externalThreadId");
CREATE INDEX "socialThread_companyId_lastMessageAt_idx" ON "socialThread"("companyId", "lastMessageAt");
CREATE INDEX "socialThread_contactId_lastMessageAt_idx" ON "socialThread"("contactId", "lastMessageAt");
CREATE UNIQUE INDEX "socialMessage_threadId_externalMessageId_key" ON "socialMessage"("threadId", "externalMessageId");
CREATE INDEX "socialMessage_threadId_sentAt_idx" ON "socialMessage"("threadId", "sentAt");
ALTER TABLE "socialThread" ADD CONSTRAINT "socialThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "socialThread" ADD CONSTRAINT "socialThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "socialMessage" ADD CONSTRAINT "socialMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "socialThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
