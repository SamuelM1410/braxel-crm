CREATE TYPE "braxel"."SocialChannel" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'FACEBOOK');

CREATE TABLE "braxel"."socialThread" (
  "id" TEXT NOT NULL, "channel" "braxel"."SocialChannel" NOT NULL,
  "externalThreadId" TEXT NOT NULL, "externalSenderId" TEXT NOT NULL,
  "externalRecipientId" TEXT, "companyId" TEXT, "contactId" TEXT,
  "firstMessageAt" TIMESTAMP(3) NOT NULL, "lastMessageAt" TIMESTAMP(3) NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "socialThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "braxel"."socialMessage" (
  "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "externalMessageId" TEXT NOT NULL,
  "direction" "braxel"."EmailDirection" NOT NULL, "senderId" TEXT NOT NULL,
  "body" TEXT, "raw" JSONB NOT NULL, "sentAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "socialMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "socialThread_channel_externalThreadId_key" ON "braxel"."socialThread"("channel", "externalThreadId");
CREATE INDEX "socialThread_companyId_lastMessageAt_idx" ON "braxel"."socialThread"("companyId", "lastMessageAt");
CREATE INDEX "socialThread_contactId_lastMessageAt_idx" ON "braxel"."socialThread"("contactId", "lastMessageAt");
CREATE UNIQUE INDEX "socialMessage_threadId_externalMessageId_key" ON "braxel"."socialMessage"("threadId", "externalMessageId");
CREATE INDEX "socialMessage_threadId_sentAt_idx" ON "braxel"."socialMessage"("threadId", "sentAt");
ALTER TABLE "braxel"."socialThread" ADD CONSTRAINT "socialThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "braxel"."company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "braxel"."socialThread" ADD CONSTRAINT "socialThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "braxel"."contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "braxel"."socialMessage" ADD CONSTRAINT "socialMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "braxel"."socialThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
