import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "../generated/client/index.js";
import { buildApp } from "./app.js";
import { issueToken } from "./lib/auth.js";

const tenantId = "22222222-2222-4222-8222-222222222222";
const branchId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const shiftId = "55555555-5555-4555-8555-555555555555";
const categoryId = "66666666-6666-4666-8666-666666666666";

async function token(permissions: string[]) {
  return issueToken({ userId, tenantId, branchId, permissions });
}

describe("cash shifts", () => {
  it("opens a branch shift with an audited opening balance", async () => {
    const create = vi.fn().mockResolvedValue({ id: shiftId, tenantId, branchId, openedById: userId, openingBalance: new Prisma.Decimal(2000), status: "OPEN" });
    const prisma = {
      branch: { findFirst: vi.fn().mockResolvedValue({ id: branchId }) },
      cashShift: { findFirst: vi.fn().mockResolvedValue(null), create },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const response = await app.inject({ method: "POST", url: "/finance/shifts/open", headers: { authorization: `Bearer ${await token(["cash.manage"])}` }, payload: { openingBalance: "2000.00" } });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: shiftId, openingBalance: 2000, status: "OPEN" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId, branchId, openedById: userId }) }));
  });

  it("closes a shift with expected cash and the exact variance", async () => {
    const update = vi.fn().mockImplementation(({ data }) => ({ id: shiftId, openingBalance: new Prisma.Decimal(2000), ...data }));
    const prisma = {
      cashShift: { findFirst: vi.fn().mockResolvedValue({ id: shiftId, tenantId, branchId, openingBalance: new Prisma.Decimal(2000), status: "OPEN", notes: null }), update },
      cashTransaction: { findMany: vi.fn().mockResolvedValue([
        { amount: new Prisma.Decimal(10450), direction: "IN" },
        { amount: new Prisma.Decimal(500), direction: "OUT" },
      ]) },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const response = await app.inject({ method: "POST", url: `/finance/shifts/${shiftId}/close`, headers: { authorization: `Bearer ${await token(["cash.manage"])}` }, payload: { actualCash: "11900.00" } });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ expectedCash: 11950, actualCash: 11900, variance: -50, status: "CLOSED" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expectedCash: 11950, actualCash: 11900, variance: -50 }) }));
  });
});

describe("expenses and financial reports", () => {
  it("posts an expense and its append-only cash transaction atomically", async () => {
    const transactionCreate = vi.fn().mockResolvedValue({ id: "77777777-7777-4777-8777-777777777777" });
    const expenseCreate = vi.fn().mockResolvedValue({ id: "88888888-8888-4888-8888-888888888888", amount: new Prisma.Decimal(500), category: { id: categoryId, name: "مرافق" } });
    const tx = { cashTransaction: { create: transactionCreate }, expense: { create: expenseCreate } };
    const prisma = {
      branch: { findFirst: vi.fn().mockResolvedValue({ id: branchId }) },
      expenseCategory: { findFirst: vi.fn().mockResolvedValue({ id: categoryId }) },
      cashShift: { findFirst: vi.fn().mockResolvedValue({ id: shiftId }) },
      $transaction: vi.fn(async (callback) => callback(tx)),
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const response = await app.inject({ method: "POST", url: "/finance/expenses", headers: { authorization: `Bearer ${await token(["expense.manage"])}` }, payload: { categoryId, amount: "500.00", paymentMethod: "CASH", description: "فاتورة كهرباء" } });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(transactionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "EXPENSE", direction: "OUT", shiftId, amount: expect.any(Prisma.Decimal) }) }));
    expect(expenseCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cashTransactionId: "77777777-7777-4777-8777-777777777777" }) }));
  });

  it("returns separate revenue, collections, expenses, refunds, outstanding and payment method totals", async () => {
    const prisma = {
      cashTransaction: { findMany: vi.fn().mockResolvedValue([
        { type: "DEPOSIT", amount: new Prisma.Decimal(100), direction: "IN", paymentMethod: "CASH" },
        { type: "COLLECTION", amount: new Prisma.Decimal(900), direction: "IN", paymentMethod: "CARD" },
        { type: "EXPENSE", amount: new Prisma.Decimal(100), direction: "OUT", paymentMethod: "CASH" },
        { type: "REFUND", amount: new Prisma.Decimal(50), direction: "OUT", paymentMethod: "CASH" },
      ]) },
      repairQuote: { findMany: vi.fn().mockResolvedValue([{ amount: new Prisma.Decimal(1200) }]) },
      repairOrder: { findMany: vi.fn().mockResolvedValue([{ estimatedCost: new Prisma.Decimal(1200), quotes: [{ amount: new Prisma.Decimal(1200) }], payments: [{ amount: new Prisma.Decimal(1000), kind: "COLLECTION" }] }]) },
    } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const response = await app.inject({ method: "GET", url: "/finance/report?from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.999Z", headers: { authorization: `Bearer ${await token(["report.financial.view"])}` } });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ revenue: 1200, collections: 1000, deposits: 100, finalCollections: 900, expenses: 100, refunds: 50, outstanding: 200, cashMovement: -50, transactionCount: 4 });
    expect(response.json().paymentMethods).toEqual(expect.arrayContaining([{ method: "CASH", amount: -50 }, { method: "CARD", amount: 900 }]));
  });
});