ALTER TABLE "Tenant"
  ADD COLUMN "receiptPaperWidth" TEXT NOT NULL DEFAULT '80mm',
  ADD COLUMN "thermalPrinterSettings" JSONB,
  ADD COLUMN "labelPrinterSettings" JSONB,
  ADD COLUMN "whatsappSettings" JSONB,
  ADD COLUMN "workflowSettings" JSONB,
  ADD COLUMN "messageTemplates" JSONB;
