CREATE TABLE "braxel"."metaConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "metaUserId" TEXT NOT NULL,
  "displayName" TEXT,
  "encryptedAccessToken" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3),
  "replyAssistantEnabled" BOOLEAN NOT NULL DEFAULT false,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "metaConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "braxel"."metaPage" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "encryptedPageAccessToken" TEXT NOT NULL,
  "instagramBusinessAccountId" TEXT,
  "instagramUsername" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "metaPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "braxel"."metaOAuthState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "returnUrl" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metaOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metaConnection_userId_key" ON "braxel"."metaConnection"("userId");
CREATE INDEX "metaConnection_metaUserId_idx" ON "braxel"."metaConnection"("metaUserId");
CREATE UNIQUE INDEX "metaPage_pageId_key" ON "braxel"."metaPage"("pageId");
CREATE UNIQUE INDEX "metaPage_instagramBusinessAccountId_key" ON "braxel"."metaPage"("instagramBusinessAccountId");
CREATE INDEX "metaPage_connectionId_enabled_idx" ON "braxel"."metaPage"("connectionId", "enabled");
CREATE INDEX "metaOAuthState_expiresAt_idx" ON "braxel"."metaOAuthState"("expiresAt");

ALTER TABLE "braxel"."metaConnection"
  ADD CONSTRAINT "metaConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "braxel"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "braxel"."metaPage"
  ADD CONSTRAINT "metaPage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "braxel"."metaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
