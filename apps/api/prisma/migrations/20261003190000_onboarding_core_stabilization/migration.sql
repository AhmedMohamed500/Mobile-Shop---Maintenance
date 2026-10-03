ALTER TABLE "Tenant" ADD COLUMN "governorate" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "defaultWarrantyDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

ALTER TABLE "Branch" ADD COLUMN "whatsapp" TEXT,
ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "username" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "whatsapp" TEXT;
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");

CREATE TABLE "Workstation" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "defaultPage" TEXT NOT NULL DEFAULT 'dashboard',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Workstation_branchId_name_key" ON "Workstation"("branchId", "name");
CREATE INDEX "Workstation_tenantId_branchId_isActive_idx" ON "Workstation"("tenantId", "branchId", "isActive");
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnboardingRequest" (
  "id" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingRequest_idempotencyKey_key" ON "OnboardingRequest"("idempotencyKey");
