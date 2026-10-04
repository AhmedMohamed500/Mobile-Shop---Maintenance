import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/client/index.js";
import { buildApp } from "./app.js";
import { issueToken } from "./lib/auth.js";
import { hashToken } from "./lib/crypto.js";

const repairId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const branchId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";

function quoteFixture(decision: "APPROVED" | "REJECTED" | null = null) {
  return {
    id: "55555555-5555-4555-8555-555555555555", repairOrderId: repairId, version: 1, amount: 850, diagnosis: "تغيير الشاشة", customerNote: "ضمان شهر", status: decision ?? "PENDING", createdAt: new Date(), decidedAt: decision ? new Date() : null,
    decision: decision ? { decision } : null,
    repairOrder: { id: repairId, repairNumber: "REP-2026-000001", status: decision ? (decision === "APPROVED" ? "CUSTOMER_APPROVED" : "CUSTOMER_DECLINED") : "AWAITING_CUSTOMER_APPROVAL", tenantId, branchId, customer: { name: "أحمد", phoneNormalized: "+201001234567", whatsappPhone: null }, brand: { name: "Samsung" } },
  };
}

describe("public quote approval", () => {
  it("records approval once and advances the repair", async () => {
    const quote = quoteFixture();
    const tx = { repairQuote: { update: vi.fn() }, repairQuoteDecision: { create: vi.fn() }, repairOrder: { update: vi.fn() }, repairStatusHistory: { create: vi.fn() }, whatsappMessage: { create: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: "message-1" }) }, auditLog: { create: vi.fn() }, systemEvent: { create: vi.fn() } };
    const prisma = { repairQuote: { findUnique: vi.fn().mockResolvedValue(quote) }, $transaction: vi.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const token = "valid-public-approval-token-value";
    const response = await app.inject({ method: "POST", url: `/public/approval/${token}`, payload: { decision: "APPROVED" } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toMatchObject({ success: true, decision: "APPROVED", alreadyRecorded: false });
    expect(prisma.repairQuote.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { approvalTokenHash: hashToken(token) } }));
    expect(tx.repairOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "CUSTOMER_APPROVED" } }));
    expect(tx.repairQuoteDecision.create).toHaveBeenCalledTimes(1);
  });

  it("is idempotent for the same customer decision", async () => {
    const tx = vi.fn();
    const prisma = { repairQuote: { findUnique: vi.fn().mockResolvedValue(quoteFixture("APPROVED")) }, $transaction: tx } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const response = await app.inject({ method: "POST", url: "/public/approval/valid-public-approval-token-value", payload: { decision: "APPROVED" } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ alreadyRecorded: true });
    expect(tx).not.toHaveBeenCalled();
  });

  it("rejects a conflicting second decision", async () => {
    const prisma = { repairQuote: { findUnique: vi.fn().mockResolvedValue(quoteFixture("APPROVED")) } } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const response = await app.inject({ method: "POST", url: "/public/approval/valid-public-approval-token-value", payload: { decision: "REJECTED" } });
    await app.close();
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ success: false, message: "تم تسجيل قرار مختلف لهذا العرض مسبقًا" });
  });
});

describe("tenant boundaries and delivery", () => {
  it("always scopes repair lists to the authenticated tenant and branch", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { repairOrder: { findMany } } as unknown as PrismaClient;
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["repair.view"] });
    const app = buildApp(prisma);
    const response = await app.inject({ method: "GET", url: "/repairs", headers: { authorization: `Bearer ${token}` } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId, branchId }) }));
  });

  it("collects the exact balance, delivers, and purges unlock secrets", async () => {
    const tx = { payment: { create: vi.fn().mockResolvedValue({ id: "payment-1" }) }, cashShift: { findFirst: vi.fn().mockResolvedValue(null) }, cashTransaction: { create: vi.fn() }, repairOrder: { update: vi.fn() }, repairStatusHistory: { create: vi.fn() }, printJob: { create: vi.fn() }, whatsappMessage: { create: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: "message-1" }) }, auditLog: { create: vi.fn() }, systemEvent: { create: vi.fn() } };
    const prisma = {
      idempotencyKey: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
      repairOrder: { findFirst: vi.fn().mockResolvedValue({ id: repairId, tenantId, branchId, repairNumber: "REP-2026-000001", status: "READY_FOR_DELIVERY", model: "A54", estimatedCost: 900, customer: { name: "أحمد", phoneNormalized: "+201001234567", whatsappPhone: null }, brand: { name: "Samsung" }, branch: { name: "الرئيسي" }, tenant: { name: "مركز الصيانة", phone: "+201000000000" }, printJobs: [], payments: [{ amount: 200, kind: "DEPOSIT" }], quotes: [] }) },
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["delivery.complete", "payment.create"] });
    const app = buildApp(prisma);
    const response = await app.inject({ method: "POST", url: `/repairs/${repairId}/deliver`, headers: { authorization: `Bearer ${token}`, "idempotency-key": "delivery-test-key-0001" }, payload: { collectedAmount: "700.00" } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, status: "DELIVERED", finalCharge: 900, paid: 900, remaining: 0 });
    expect(tx.payment.create).toHaveBeenCalled();
    expect(tx.repairOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DELIVERED", unlockKind: null, unlockCiphertext: null, unlockIv: null, unlockAuthTag: null }) }));
    expect(tx.printJob.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "DELIVERY_RECEIPT" }) }));
  });
});

describe("reception and workshop permissions", () => {
  it("rejects intake without the reception permission", async () => {
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["repair.view"] });
    const app = buildApp({} as PrismaClient);
    const response = await app.inject({ method: "POST", url: "/repairs/intake", headers: { authorization: `Bearer ${token}`, "idempotency-key": "blocked-intake-key" }, payload: {} });
    await app.close();
    expect(response.statusCode).toBe(403);
  });

  it("rejects status changes without workshop permission", async () => {
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["repair.view"] });
    const app = buildApp({} as PrismaClient);
    const response = await app.inject({ method: "POST", url: `/repairs/${repairId}/status`, headers: { authorization: `Bearer ${token}` }, payload: { status: "DIAGNOSING" } });
    await app.close();
    expect(response.statusCode).toBe(403);
  });

  it("returns the prior intake result for a repeated idempotency key", async () => {
    const prior = { repairId, repairNumber: "REP-2026-000001", trackingUrl: "https://example.test/r/token", printJobsQueued: 2, whatsappQueued: true };
    const prisma = { idempotencyKey: { findUnique: vi.fn().mockResolvedValue({ requestHash: "", response: prior }) } } as unknown as PrismaClient;
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["repair.intake.create"] });
    const payload = { branchId, customer: { name: "عميل اختبار", phone: "01012345678", isRegular: false }, device: { brandId: "66666666-6666-4666-8666-666666666666", model: "A54" }, reportedFault: "عطل في الشاشة", faultPresetIds: [], estimatedCost: "500.00", deposit: "100.00", paymentMethod: "CASH" };
    const { createHash } = await import("node:crypto");
    (prisma.idempotencyKey.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), response: prior });
    const app = buildApp(prisma);
    const response = await app.inject({ method: "POST", url: "/repairs/intake", headers: { authorization: `Bearer ${token}`, "idempotency-key": "same-intake-key-001" }, payload });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(prior);
  });

  it("derives the reception ready list from repair status", async () => {
    const count = vi.fn().mockResolvedValue(0); const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { repairOrder: { count, findMany } } as unknown as PrismaClient;
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["repair.view"] });
    const app = buildApp(prisma);
    const response = await app.inject({ method: "GET", url: "/dashboard/reception", headers: { authorization: `Bearer ${token}` } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(count.mock.calls[1]![0].where.status.in).toEqual(["READY_FOR_DELIVERY", "READY_FOR_RETURN_WITHOUT_REPAIR"]);
    expect(response.json()).toMatchObject({ ready: 0, readyRepairs: [] });
  });

  it("scopes editable brands and fault presets to the authenticated tenant", async () => {
    const brandFind = vi.fn().mockResolvedValue([]); const faultFind = vi.fn().mockResolvedValue([]); const branchFind = vi.fn().mockResolvedValue([]);
    const prisma = { deviceBrand: { findMany: brandFind }, faultPreset: { findMany: faultFind }, branch: { findMany: branchFind } } as unknown as PrismaClient;
    const token = await issueToken({ userId, tenantId, branchId, permissions: [] }); const app = buildApp(prisma);
    const response = await app.inject({ method: "GET", url: "/catalog", headers: { authorization: `Bearer ${token}` } }); await app.close();
    expect(response.statusCode).toBe(200); expect(brandFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId }) })); expect(faultFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId }) }));
  });
});


describe("manual WhatsApp resend", () => {
  it("creates an explicit audited resend without changing repair state", async () => {
    const create = vi.fn().mockResolvedValue({ id: "77777777-7777-4777-8777-777777777777" }); const audit = vi.fn();
    const prisma = {
      repairOrder: { findFirst: vi.fn().mockResolvedValue({ id: repairId, branchId, whatsappMessages: [{ id: "88888888-8888-4888-8888-888888888888", type: "DEVICE_RECEIVED", recipient: "+201012345678", templateKey: "device_received", variables: { customerName: "أحمد" } }] }) },
      $transaction: vi.fn(async (callback) => callback({ whatsappMessage: { create }, auditLog: { create: audit } })),
    } as unknown as PrismaClient;
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["whatsapp.manage"] }); const app = buildApp(prisma);
    const response = await app.inject({ method: "POST", url: `/repairs/${repairId}/whatsapp/resend`, headers: { authorization: `Bearer ${token}` }, payload: {} }); await app.close();
    expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ success: true, status: "PENDING" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "DEVICE_RECEIVED_RESEND", repairOrderId: repairId }) }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "whatsapp.manual_resend" }) }));
  });
});
