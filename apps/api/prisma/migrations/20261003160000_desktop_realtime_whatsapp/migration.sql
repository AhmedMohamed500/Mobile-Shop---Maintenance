ALTER TABLE "PrintJob"
  ADD COLUMN "printerName" TEXT,
  ADD COLUMN "workstationId" TEXT,
  ADD COLUMN "printedAt" TIMESTAMP(3);

ALTER TABLE "WhatsappMessage"
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "readAt" TIMESTAMP(3);

CREATE TABLE "SystemEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID,
  "type" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsappWebhookEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrintJob_workstationId_status_idx" ON "PrintJob"("workstationId", "status");
CREATE INDEX "SystemEvent_tenantId_branchId_createdAt_idx" ON "SystemEvent"("tenantId", "branchId", "createdAt");
CREATE INDEX "SystemEvent_tenantId_type_createdAt_idx" ON "SystemEvent"("tenantId", "type", "createdAt");
CREATE UNIQUE INDEX "WhatsappWebhookEvent_providerEventId_key" ON "WhatsappWebhookEvent"("providerEventId");
CREATE INDEX "WhatsappWebhookEvent_tenantId_createdAt_idx" ON "WhatsappWebhookEvent"("tenantId", "createdAt");
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsappWebhookEvent" ADD CONSTRAINT "WhatsappWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
