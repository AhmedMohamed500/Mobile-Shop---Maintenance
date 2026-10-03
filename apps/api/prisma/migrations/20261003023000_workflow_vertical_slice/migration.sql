CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "QuoteDecisionType" AS ENUM ('APPROVED', 'REJECTED');
CREATE TYPE "RepairNoteType" AS ENUM ('DIAGNOSTIC', 'INTERNAL');

ALTER TABLE "Customer" ADD COLUMN "whatsappPhone" TEXT;
ALTER TABLE "Customer" ADD COLUMN "notes" TEXT;
ALTER TABLE "Customer" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payment" ADD COLUMN "createdById" UUID;

CREATE TABLE "RepairQuote" (
    "id" UUID NOT NULL,
    "repairOrderId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "customerNote" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "approvalTokenHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "RepairQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepairQuoteDecision" (
    "id" UUID NOT NULL,
    "repairQuoteId" UUID NOT NULL,
    "decision" "QuoteDecisionType" NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepairQuoteDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepairNote" (
    "id" UUID NOT NULL,
    "repairOrderId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "type" "RepairNoteType" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepairNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepairAssignment" (
    "id" UUID NOT NULL,
    "repairOrderId" UUID NOT NULL,
    "technicianId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "RepairAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairQuote_approvalTokenHash_key" ON "RepairQuote"("approvalTokenHash");
CREATE UNIQUE INDEX "RepairQuote_repairOrderId_version_key" ON "RepairQuote"("repairOrderId", "version");
CREATE INDEX "RepairQuote_repairOrderId_status_createdAt_idx" ON "RepairQuote"("repairOrderId", "status", "createdAt");
CREATE UNIQUE INDEX "RepairQuoteDecision_repairQuoteId_key" ON "RepairQuoteDecision"("repairQuoteId");
CREATE INDEX "RepairNote_repairOrderId_createdAt_idx" ON "RepairNote"("repairOrderId", "createdAt");
CREATE INDEX "RepairAssignment_repairOrderId_endedAt_idx" ON "RepairAssignment"("repairOrderId", "endedAt");
CREATE INDEX "RepairAssignment_technicianId_endedAt_idx" ON "RepairAssignment"("technicianId", "endedAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RepairQuote" ADD CONSTRAINT "RepairQuote_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairQuote" ADD CONSTRAINT "RepairQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairQuoteDecision" ADD CONSTRAINT "RepairQuoteDecision_repairQuoteId_fkey" FOREIGN KEY ("repairQuoteId") REFERENCES "RepairQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairNote" ADD CONSTRAINT "RepairNote_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairNote" ADD CONSTRAINT "RepairNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairAssignment" ADD CONSTRAINT "RepairAssignment_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairAssignment" ADD CONSTRAINT "RepairAssignment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairAssignment" ADD CONSTRAINT "RepairAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairStatusHistory" ALTER COLUMN "changedById" DROP NOT NULL;
