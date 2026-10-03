import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/client/index.js";
import { z } from "zod";
import { hashToken } from "../lib/crypto.js";
import { approvedCharge, httpError, paidTotal } from "./shared.js";

function publicQuote(quote: { version: number; amount: unknown; diagnosis: string; customerNote: string | null; status: string; createdAt: Date; decidedAt: Date | null }) {
  return { version: quote.version, amount: Number(quote.amount), diagnosis: quote.diagnosis, customerNote: quote.customerNote, status: quote.status, createdAt: quote.createdAt, decidedAt: quote.decidedAt };
}

export function registerPublicRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/public/approval/:token", async (request) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(request.params);
    const quote = await prisma.repairQuote.findUnique({
      where: { approvalTokenHash: hashToken(token) },
      include: { repairOrder: { include: { customer: true, brand: true } }, decision: true },
    });
    if (!quote) throw httpError(404, "رابط الموافقة غير صالح أو منتهي");
    return {
      repairNumber: quote.repairOrder.repairNumber,
      customerName: quote.repairOrder.customer.name,
      device: `${quote.repairOrder.brand.name} ${quote.repairOrder.model}`,
      quote: publicQuote(quote),
      decided: quote.decision?.decision ?? null,
    };
  });

  app.post("/public/approval/:token", async (request) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(request.params);
    const { decision } = z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }).parse(request.body);
    const quote = await prisma.repairQuote.findUnique({
      where: { approvalTokenHash: hashToken(token) },
      include: { repairOrder: { include: { customer: true } }, decision: true },
    });
    if (!quote) throw httpError(404, "رابط الموافقة غير صالح أو منتهي");
    if (quote.decision) {
      if (quote.decision.decision !== decision) throw httpError(409, "تم تسجيل قرار مختلف لهذا العرض مسبقًا");
      return { success: true, decision, repairNumber: quote.repairOrder.repairNumber, alreadyRecorded: true };
    }
    if (quote.status !== "PENDING" || quote.repairOrder.status !== "AWAITING_CUSTOMER_APPROVAL") throw httpError(409, "عرض السعر لم يعد متاحًا لاتخاذ قرار");

    const nextStatus = decision === "APPROVED" ? "CUSTOMER_APPROVED" : "CUSTOMER_DECLINED";
    await prisma.$transaction(async (tx) => {
      await tx.repairQuote.update({ where: { id: quote.id }, data: { status: decision, decidedAt: new Date() } });
      await tx.repairQuoteDecision.create({ data: { repairQuoteId: quote.id, decision, channel: "PUBLIC_LINK" } });
      await tx.repairOrder.update({ where: { id: quote.repairOrderId }, data: { status: nextStatus } });
      await tx.repairStatusHistory.create({ data: { repairOrderId: quote.repairOrderId, fromStatus: quote.repairOrder.status, toStatus: nextStatus, reason: decision === "APPROVED" ? "موافقة العميل عبر الرابط" : "رفض العميل عبر الرابط" } });
      await tx.whatsappMessage.create({ data: { repairOrderId: quote.repairOrderId, tenantId: quote.repairOrder.tenantId, branchId: quote.repairOrder.branchId, type: "QUOTE_DECISION", recipient: quote.repairOrder.customer.whatsappPhone ?? quote.repairOrder.customer.phoneNormalized, templateKey: decision === "APPROVED" ? "quote_approved" : "quote_rejected", variables: { repairNumber: quote.repairOrder.repairNumber, decision, version: quote.version }, idempotencyKey: `quote:${quote.id}:decision:${decision}` } });
      await tx.auditLog.create({ data: { tenantId: quote.repairOrder.tenantId, action: decision === "APPROVED" ? "quote.customer_approved" : "quote.customer_rejected", entityType: "repair_quote", entityId: quote.id, after: { decision, version: quote.version } } });
    });
    return { success: true, decision, repairNumber: quote.repairOrder.repairNumber, alreadyRecorded: false };
  });

  app.get("/public/tracking/:token", async (request) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(request.params);
    const repair = await prisma.repairOrder.findUnique({
      where: { publicTokenHash: hashToken(token) },
      include: { tenant: true, branch: true, brand: true, statusHistory: { orderBy: { createdAt: "asc" } }, payments: true, quotes: { orderBy: { version: "desc" } } },
    });
    if (!repair) throw httpError(404, "رابط المتابعة غير صالح");
    const paid = paidTotal(repair.payments);
    const charge = approvedCharge(repair.quotes, Number(repair.estimatedCost));
    return {
      shop: { name: repair.tenant.name, logoUrl: repair.tenant.logoUrl, primaryColor: repair.tenant.primaryColor, phone: repair.tenant.phone },
      branch: { name: repair.branch.name, address: repair.branch.address, phone: repair.branch.phone },
      repairNumber: repair.repairNumber,
      device: { brand: repair.brand.name, model: repair.model },
      status: repair.status,
      reportedFault: repair.reportedFault,
      estimatedCost: Number(repair.estimatedCost),
      approvedAmount: charge,
      paid,
      remaining: Math.max(0, charge - paid),
      createdAt: repair.createdAt,
      updatedAt: repair.updatedAt,
      lastUpdate: repair.updatedAt,
      history: repair.statusHistory.map((item) => ({ status: item.toStatus, reason: item.reason, createdAt: item.createdAt })),
      timeline: repair.statusHistory.map((item) => ({ toStatus: item.toStatus, createdAt: item.createdAt })),
    };
  });
}

