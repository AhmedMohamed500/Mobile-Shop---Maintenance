import type { FastifyInstance } from "fastify";
import { CashDirection, CashTransactionType, PaymentMethod, Prisma, type PrismaClient } from "../../generated/client/index.js";
import { z } from "zod";
import { requireAuth, requirePermission } from "../lib/auth.js";
import { httpError, moneyInput } from "./shared.js";

const methodSchema = z.nativeEnum(PaymentMethod);
const positiveMoney = moneyInput.refine((value) => Number(value) > 0, "INVALID_MONEY");
const branchSchema = z.string().uuid();

async function allowedBranch(prisma: PrismaClient, tenantId: string, authBranchId: string | null, requested?: string) {
  const branchId = authBranchId ?? requested;
  if (!branchId) throw httpError(422, "حدد الفرع");
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId, isActive: true } });
  if (!branch) throw httpError(403, "الفرع غير مسموح");
  return branch;
}

const signedTotal = (rows: { amount: Prisma.Decimal | number; direction: CashDirection }[], cashOnly = false, methods?: { paymentMethod: PaymentMethod }[]) =>
  rows.reduce((sum, row, index) => sum + (cashOnly && methods?.[index]?.paymentMethod !== "CASH" ? 0 : Number(row.amount) * (row.direction === "IN" ? 1 : -1)), 0);

export function registerFinanceRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/finance/shifts/current", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "cash.manage");
    const { branchId } = z.object({ branchId: branchSchema.optional() }).parse(request.query);
    const branch = await allowedBranch(prisma, auth.tenantId, auth.branchId, branchId);
    const shift = await prisma.cashShift.findFirst({ where: { tenantId: auth.tenantId, branchId: branch.id, status: "OPEN" }, include: { openedBy: { select: { name: true } }, transactions: { orderBy: { createdAt: "desc" }, take: 100 } }, orderBy: { openedAt: "desc" } });
    if (!shift) return null;
    const cashMovement = shift.transactions.filter((item) => item.paymentMethod === "CASH").reduce((sum, item) => sum + Number(item.amount) * (item.direction === "IN" ? 1 : -1), 0);
    return { ...shift, openingBalance: Number(shift.openingBalance), expectedCash: Number(shift.openingBalance) + cashMovement, transactions: shift.transactions.map((item) => ({ ...item, amount: Number(item.amount) })) };
  });

  app.post("/finance/shifts/open", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "cash.manage");
    const body = z.object({ branchId: branchSchema.optional(), openingBalance: moneyInput, notes: z.string().max(1000).optional() }).parse(request.body);
    const branch = await allowedBranch(prisma, auth.tenantId, auth.branchId, body.branchId);
    if (await prisma.cashShift.findFirst({ where: { tenantId: auth.tenantId, branchId: branch.id, status: "OPEN" } })) throw httpError(409, "توجد وردية مفتوحة لهذا الفرع");
    const shift = await prisma.cashShift.create({ data: { tenantId: auth.tenantId, branchId: branch.id, openedById: auth.userId, openingBalance: new Prisma.Decimal(body.openingBalance), notes: body.notes } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "cash.shift_opened", entityType: "cash_shift", entityId: shift.id, after: { branchId: branch.id, openingBalance: body.openingBalance } } });
    return reply.status(201).send({ ...shift, openingBalance: Number(shift.openingBalance) });
  });

  app.post("/finance/shifts/:id/close", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "cash.manage");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ actualCash: moneyInput, notes: z.string().max(1000).optional() }).parse(request.body);
    const shift = await prisma.cashShift.findFirst({ where: { id, tenantId: auth.tenantId, status: "OPEN", ...(auth.branchId ? { branchId: auth.branchId } : {}) } });
    if (!shift) throw httpError(404, "الوردية المفتوحة غير موجودة");
    const transactions = await prisma.cashTransaction.findMany({ where: { shiftId: id, paymentMethod: "CASH" }, select: { amount: true, direction: true } });
    const expected = Number(shift.openingBalance) + signedTotal(transactions);
    const actual = Number(new Prisma.Decimal(body.actualCash)); const variance = actual - expected;
    const closed = await prisma.cashShift.update({ where: { id }, data: { status: "CLOSED", closedById: auth.userId, closedAt: new Date(), expectedCash: expected, actualCash: actual, variance, notes: body.notes ?? shift.notes } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "cash.shift_closed", entityType: "cash_shift", entityId: id, after: { expectedCash: expected, actualCash: actual, variance } } });
    return { ...closed, openingBalance: Number(closed.openingBalance), expectedCash: Number(closed.expectedCash), actualCash: Number(closed.actualCash), variance: Number(closed.variance) };
  });

  app.post("/finance/shifts/:id/approve", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "cash.approve");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const shift = await prisma.cashShift.findFirst({ where: { id, tenantId: auth.tenantId, status: "CLOSED" } });
    if (!shift) throw httpError(404, "الوردية المغلقة غير موجودة");
    const updated = await prisma.cashShift.update({ where: { id }, data: { status: "APPROVED", approvedById: auth.userId, approvedAt: new Date() } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "cash.shift_approved", entityType: "cash_shift", entityId: id } });
    return updated;
  });

  app.get("/finance/expense-categories", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "expense.manage");
    return prisma.expenseCategory.findMany({ where: { tenantId: auth.tenantId, isActive: true }, orderBy: { name: "asc" } });
  });

  app.post("/finance/expense-categories", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "expense.manage");
    const body = z.object({ name: z.string().trim().min(2).max(100) }).parse(request.body);
    return reply.status(201).send(await prisma.expenseCategory.create({ data: { tenantId: auth.tenantId, name: body.name } }));
  });

  app.post("/finance/expenses", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "expense.manage");
    const body = z.object({ branchId: branchSchema.optional(), categoryId: z.string().uuid(), amount: positiveMoney, paymentMethod: methodSchema, description: z.string().trim().min(2).max(1000), incurredAt: z.coerce.date().default(() => new Date()), attachmentUrl: z.string().url().max(500).optional() }).parse(request.body);
    const branch = await allowedBranch(prisma, auth.tenantId, auth.branchId, body.branchId);
    const category = await prisma.expenseCategory.findFirst({ where: { id: body.categoryId, tenantId: auth.tenantId, isActive: true } });
    if (!category) throw httpError(422, "تصنيف المصروف غير صالح");
    const shift = await prisma.cashShift.findFirst({ where: { tenantId: auth.tenantId, branchId: branch.id, status: "OPEN" } });
    if (body.paymentMethod === "CASH" && !shift) throw httpError(409, "يجب فتح وردية قبل تسجيل مصروف نقدي");
    const expense = await prisma.$transaction(async (tx) => {
      const transaction = await tx.cashTransaction.create({ data: { tenantId: auth.tenantId, branchId: branch.id, shiftId: shift?.id, employeeId: auth.userId, type: "EXPENSE", direction: "OUT", amount: new Prisma.Decimal(body.amount), paymentMethod: body.paymentMethod, sourceType: "expense", notes: body.description } });
      return tx.expense.create({ data: { tenantId: auth.tenantId, branchId: branch.id, categoryId: category.id, amount: new Prisma.Decimal(body.amount), paymentMethod: body.paymentMethod, description: body.description, incurredAt: body.incurredAt, attachmentUrl: body.attachmentUrl, createdById: auth.userId, cashTransactionId: transaction.id }, include: { category: true } });
    });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "expense.posted", entityType: "expense", entityId: expense.id, after: { amount: body.amount, paymentMethod: body.paymentMethod, branchId: branch.id } } });
    return reply.status(201).send({ ...expense, amount: Number(expense.amount) });
  });

  app.post("/finance/transactions", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "cash.manage");
    const body = z.object({ branchId: branchSchema.optional(), type: z.enum(["MANUAL_INCOME", "REFUND"]), amount: positiveMoney, paymentMethod: methodSchema, reference: z.string().max(120).optional(), notes: z.string().trim().min(2).max(1000), sourceId: z.string().max(200).optional() }).parse(request.body);
    const branch = await allowedBranch(prisma, auth.tenantId, auth.branchId, body.branchId);
    const shift = await prisma.cashShift.findFirst({ where: { tenantId: auth.tenantId, branchId: branch.id, status: "OPEN" } });
    if (body.paymentMethod === "CASH" && !shift) throw httpError(409, "يجب فتح وردية قبل تسجيل حركة نقدية");
    const transaction = await prisma.cashTransaction.create({ data: { tenantId: auth.tenantId, branchId: branch.id, shiftId: shift?.id, employeeId: auth.userId, type: body.type, direction: body.type === "MANUAL_INCOME" ? "IN" : "OUT", amount: new Prisma.Decimal(body.amount), paymentMethod: body.paymentMethod, sourceType: "manual", sourceId: body.sourceId, reference: body.reference, notes: body.notes } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "cash.transaction_posted", entityType: "cash_transaction", entityId: transaction.id, after: body } });
    return reply.status(201).send({ ...transaction, amount: Number(transaction.amount) });
  });

  app.post("/finance/transactions/:id/reverse", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "cash.approve");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const body = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(request.body);
    const original = await prisma.cashTransaction.findFirst({ where: { id, tenantId: auth.tenantId }, include: { reversals: true } });
    if (!original || original.reversals.length) throw httpError(409, "الحركة غير موجودة أو تم عكسها");
    const reversed = await prisma.cashTransaction.create({ data: { tenantId: auth.tenantId, branchId: original.branchId, shiftId: original.shiftId, employeeId: auth.userId, type: "REVERSAL", direction: original.direction === "IN" ? "OUT" : "IN", amount: original.amount, paymentMethod: original.paymentMethod, sourceType: original.sourceType, sourceId: original.sourceId, notes: body.reason, reversedTransactionId: original.id } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "cash.transaction_reversed", entityType: "cash_transaction", entityId: reversed.id, after: { originalId: id, reason: body.reason } } });
    return reply.status(201).send({ ...reversed, amount: Number(reversed.amount) });
  });

  app.get("/finance/report", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "report.financial.view");
    const query = z.object({ from: z.coerce.date(), to: z.coerce.date(), branchId: branchSchema.optional() }).parse(request.query);
    const branch = auth.branchId ? { branchId: auth.branchId } : query.branchId ? { branchId: query.branchId } : {};
    const period = { gte: query.from, lte: query.to };
    const [transactions, deliveredRepairs, repairs] = await Promise.all([
      prisma.cashTransaction.findMany({ where: { tenantId: auth.tenantId, ...branch, createdAt: period }, orderBy: { createdAt: "asc" } }),
      prisma.repairOrder.findMany({ where: { tenantId: auth.tenantId, ...branch, status: "DELIVERED", deliveredAt: period }, select: { estimatedCost: true, quotes: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } } }),
      prisma.repairOrder.findMany({ where: { tenantId: auth.tenantId, ...branch, status: { notIn: ["CANCELLED", "READY_FOR_RETURN_WITHOUT_REPAIR"] } }, include: { payments: true, quotes: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } } }),
    ]);
    const sumType = (type: CashTransactionType) => transactions.filter((item) => item.type === type).reduce((sum, item) => sum + Number(item.amount), 0);
    const paymentMethods = Object.values(PaymentMethod).map((method) => ({ method, amount: transactions.filter((item) => item.paymentMethod === method).reduce((sum, item) => sum + Number(item.amount) * (item.direction === "IN" ? 1 : -1), 0) }));
    const outstanding = repairs.reduce((sum, repair) => { const charge = repair.quotes[0] ? Number(repair.quotes[0].amount) : Number(repair.estimatedCost); const paid = repair.payments.reduce((value, payment) => value + Number(payment.amount) * (payment.kind === "REFUND" || payment.kind === "REVERSAL" ? -1 : 1), 0); return sum + Math.max(0, charge - paid); }, 0);
    return {
      from: query.from, to: query.to,
      revenue: deliveredRepairs.reduce((sum, repair) => sum + Number(repair.quotes[0]?.amount ?? repair.estimatedCost), 0),
      collections: sumType("DEPOSIT") + sumType("COLLECTION"),
      deposits: sumType("DEPOSIT"), finalCollections: sumType("COLLECTION"),
      expenses: sumType("EXPENSE"), refunds: sumType("REFUND"), outstanding,
      cashMovement: transactions.filter((item) => item.paymentMethod === "CASH").reduce((sum, item) => sum + Number(item.amount) * (item.direction === "IN" ? 1 : -1), 0),
      paymentMethods, transactionCount: transactions.length,
    };
  });
}