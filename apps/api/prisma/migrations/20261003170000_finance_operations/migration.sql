CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VODAFONE_CASH', 'INSTAPAY', 'CARD', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "CashTransactionType" AS ENUM ('DEPOSIT', 'COLLECTION', 'MANUAL_INCOME', 'EXPENSE', 'REFUND', 'REVERSAL');
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "CashShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'APPROVED');

ALTER TABLE "Payment" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';

CREATE TABLE "CashShift" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "openedById" UUID NOT NULL,
  "openingBalance" DECIMAL(12,2) NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "CashShiftStatus" NOT NULL DEFAULT 'OPEN',
  "closedById" UUID,
  "closedAt" TIMESTAMP(3),
  "expectedCash" DECIMAL(12,2),
  "actualCash" DECIMAL(12,2),
  "variance" DECIMAL(12,2),
  "notes" TEXT,
  "approvedById" UUID,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashTransaction" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "shiftId" UUID,
  "employeeId" UUID NOT NULL,
  "type" "CashTransactionType" NOT NULL,
  "direction" "CashDirection" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "reference" TEXT,
  "notes" TEXT,
  "paymentId" UUID,
  "reversedTransactionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseCategory" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expense" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "description" TEXT NOT NULL,
  "attachmentUrl" TEXT,
  "incurredAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID NOT NULL,
  "cashTransactionId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashShift_tenantId_branchId_openedAt_idx" ON "CashShift"("tenantId", "branchId", "openedAt");
CREATE INDEX "CashShift_tenantId_branchId_status_idx" ON "CashShift"("tenantId", "branchId", "status");
CREATE UNIQUE INDEX "CashShift_one_open_per_branch_key" ON "CashShift"("tenantId", "branchId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "CashTransaction_paymentId_key" ON "CashTransaction"("paymentId");
CREATE INDEX "CashTransaction_tenantId_branchId_createdAt_idx" ON "CashTransaction"("tenantId", "branchId", "createdAt");
CREATE INDEX "CashTransaction_shiftId_createdAt_idx" ON "CashTransaction"("shiftId", "createdAt");
CREATE INDEX "CashTransaction_sourceType_sourceId_idx" ON "CashTransaction"("sourceType", "sourceId");
CREATE UNIQUE INDEX "ExpenseCategory_tenantId_name_key" ON "ExpenseCategory"("tenantId", "name");
CREATE INDEX "ExpenseCategory_tenantId_isActive_idx" ON "ExpenseCategory"("tenantId", "isActive");
CREATE UNIQUE INDEX "Expense_cashTransactionId_key" ON "Expense"("cashTransactionId");
CREATE INDEX "Expense_tenantId_branchId_incurredAt_idx" ON "Expense"("tenantId", "branchId", "incurredAt");

ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_reversedTransactionId_fkey" FOREIGN KEY ("reversedTransactionId") REFERENCES "CashTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashTransactionId_fkey" FOREIGN KEY ("cashTransactionId") REFERENCES "CashTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;