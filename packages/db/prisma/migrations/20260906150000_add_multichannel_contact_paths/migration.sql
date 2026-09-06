-- Public, attributable channels found during lead research.  Existing email and
-- phone columns remain the canonical direct-contact fields; these add the
-- channels a rep can verify before choosing how to approach a company.
ALTER TABLE "company"
  ADD COLUMN "instagramUrl" TEXT,
  ADD COLUMN "facebookUrl" TEXT,
  ADD COLUMN "tiktokUrl" TEXT,
  ADD COLUMN "whatsappUrl" TEXT;

ALTER TABLE "contact"
  ADD COLUMN "instagramUrl" TEXT,
  ADD COLUMN "facebookUrl" TEXT,
  ADD COLUMN "tiktokUrl" TEXT,
  ADD COLUMN "whatsappUrl" TEXT;
