import type { FastifyInstance } from "fastify";
import { Prisma, PrismaClient } from "../../generated/client/index.js";
import { z } from "zod";
import { assertTransition } from "@repair/domain";
import { requireAuth, requirePermission } from "../lib/auth.js";
import { createPublicToken, hashRequest, hashToken } from "../lib/crypto.js";
import { approvalBaseUrl, approvedCharge, httpError, moneyInput, paidTotal, statusSchema } from "./shared.js";

export function registerWorkflowRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.post("/repairs/:id/status", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.status.change");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: statusSchema, reason: z.string().max(500).optional() }).parse(request.body);
    if (["CUSTOMER_APPROVED", "CUSTOMER_DECLINED", "DELIVERED"].includes(body.status)) throw httpError(422, "استخدم إجراء موافقة العميل أو التسليم المخصص");
    const repair = await prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId }, include: { customer: true, payments: true, quotes: { orderBy: { version: "desc" } } } });
    if (!repair) throw httpError(404, "أمر الصيانة غير موجود");
    assertTransition(repair.status, body.status);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.repairOrder.update({ where: { id }, data: { status: body.status } });
      await tx.repairStatusHistory.create({ data: { repairOrderId: id, fromStatus: repair.status, toStatus: body.status, reason: body.reason, changedById: auth.userId } });
      const message = body.status === "UNDER_REPAIR" ? { type: "UNDER_REPAIR", key: "under_repair" } : body.status === "READY_FOR_DELIVERY" ? { type: "READY_FOR_DELIVERY", key: "ready_for_delivery" } : undefined;
      if (message) await tx.whatsappMessage.create({ data: { repairOrderId: id, tenantId: auth.tenantId, branchId: repair.branchId, type: message.type, recipient: repair.customer.whatsappPhone ?? repair.customer.phoneNormalized, templateKey: message.key, variables: { repairNumber: repair.repairNumber, status: body.status, ...(body.status === "READY_FOR_DELIVERY" ? { remaining: Math.max(0, approvedCharge(repair.quotes, Number(repair.estimatedCost)) - paidTotal(repair.payments)) } : {}) }, idempotencyKey: `repair:${id}:status:${body.status}:${updated.updatedAt.toISOString()}` } });
      await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.status_changed", entityType: "repair_order", entityId: id, before: { status: repair.status }, after: { status: body.status } } });
      return updated;
    });
  });

  app.post("/repairs/:id/status/correct", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.status.correct");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: statusSchema, reason: z.string().trim().min(5).max(500) }).parse(request.body);
    const repair = await prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!repair) throw httpError(404, "أمر الصيانة غير موجود");
    if (repair.status === body.status) throw httpError(409, "الحالة الجديدة مطابقة للحالة الحالية");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.repairOrder.update({ where: { id }, data: { status: body.status } });
      await tx.repairStatusHistory.create({ data: { repairOrderId: id, fromStatus: repair.status, toStatus: body.status, reason: `تصحيح إداري: ${body.reason}`, changedById: auth.userId } });
      await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.status_corrected", entityType: "repair_order", entityId: id, before: { status: repair.status }, after: { status: body.status, reason: body.reason } } });
      return updated;
    });
  });

  app.post("/repairs/:id/notes", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.edit");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ type: z.enum(["DIAGNOSTIC", "INTERNAL"]), body: z.string().trim().min(2).max(3000) }).parse(request.body);
    const repair = await prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!repair) throw httpError(404, "أمر الصيانة غير موجود");
    return reply.status(201).send(await prisma.repairNote.create({ data: { repairOrderId: id, authorId: auth.userId, type: body.type, body: body.body }, include: { author: { select: { name: true } } } }));
  });

  app.get("/workshop/technicians", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "workshop.access");
    return prisma.user.findMany({ where: { tenantId: auth.tenantId, isActive: true, roles: { some: { role: { permissions: { some: { permissionId: "workshop.access" } } } } } }, select: { id: true, name: true, branchId: true }, orderBy: { name: "asc" } });
  });

  app.post("/repairs/:id/assign", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.edit");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { technicianId } = z.object({ technicianId: z.string().uuid() }).parse(request.body);
    const [repair, technician] = await Promise.all([prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId } }), prisma.user.findFirst({ where: { id: technicianId, tenantId: auth.tenantId, isActive: true } })]);
    if (!repair || !technician) throw httpError(404, "أمر الصيانة أو الفني غير موجود");
    const assignment = await prisma.$transaction(async (tx) => {
      await tx.repairAssignment.updateMany({ where: { repairOrderId: id, endedAt: null }, data: { endedAt: new Date() } });
      const created = await tx.repairAssignment.create({ data: { repairOrderId: id, technicianId, assignedById: auth.userId } });
      await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.assigned", entityType: "repair_order", entityId: id, after: { technicianId } } });
      return created;
    });
    return reply.status(201).send(assignment);
  });

  app.post("/repairs/:id/quotes", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.quote.create");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ amount: moneyInput, diagnosis: z.string().trim().min(3).max(3000), customerNote: z.string().max(1000).optional() }).parse(request.body);
    const repair = await prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId }, include: { customer: true, quotes: { orderBy: { version: "desc" } } } });
    if (!repair) throw httpError(404, "أمر الصيانة غير موجود");
    if (["DELIVERED", "CANCELLED", "READY_FOR_DELIVERY", "READY_FOR_RETURN_WITHOUT_REPAIR"].includes(repair.status)) throw httpError(409, "لا يمكن إنشاء عرض سعر في الحالة الحالية");
    const token = createPublicToken(); const version = (repair.quotes[0]?.version ?? 0) + 1; const approvalUrl = `${approvalBaseUrl()}/approve/${token}`;
    const quote = await prisma.$transaction(async (tx) => {
      await tx.repairQuote.updateMany({ where: { repairOrderId: id, status: "PENDING" }, data: { status: "SUPERSEDED" } });
      const created = await tx.repairQuote.create({ data: { repairOrderId: id, version, amount: new Prisma.Decimal(body.amount), diagnosis: body.diagnosis, customerNote: body.customerNote, approvalTokenHash: hashToken(token), createdById: auth.userId } });
      if (repair.status !== "AWAITING_CUSTOMER_APPROVAL") {
        await tx.repairOrder.update({ where: { id }, data: { status: "AWAITING_CUSTOMER_APPROVAL" } });
        await tx.repairStatusHistory.create({ data: { repairOrderId: id, fromStatus: repair.status, toStatus: "AWAITING_CUSTOMER_APPROVAL", reason: `عرض سعر رقم ${version}`, changedById: auth.userId } });
      }
      await tx.whatsappMessage.create({ data: { repairOrderId: id, tenantId: auth.tenantId, branchId: repair.branchId, type: "WAITING_APPROVAL", recipient: repair.customer.whatsappPhone ?? repair.customer.phoneNormalized, templateKey: "waiting_approval", variables: { repairNumber: repair.repairNumber, diagnosis: body.diagnosis, amount: body.amount, approvalUrl }, idempotencyKey: `repair:${id}:quote:${version}` } });
      await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.quote_created", entityType: "repair_quote", entityId: created.id, after: { repairOrderId: id, version, amount: body.amount } } });
      return created;
    });
    return reply.status(201).send({ id: quote.id, version, amount: Number(quote.amount), status: quote.status, approvalUrl });
  });

  app.post("/repairs/:id/deliver", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "delivery.complete"); requirePermission(auth, "payment.create");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ collectedAmount: moneyInput.default("0"), reference: z.string().max(120).optional() }).parse(request.body);
    const key = z.string().min(8).max(200).parse(request.headers["idempotency-key"]); const requestHash = hashRequest(body);
    const prior = await prisma.idempotencyKey.findUnique({ where: { tenantId_key: { tenantId: auth.tenantId, key } } });
    if (prior) { if (prior.requestHash !== requestHash) return reply.status(409).send({ error: "مفتاح العملية مستخدم لطلب مختلف" }); if (prior.response) return prior.response; return reply.status(409).send({ error: "العملية قيد التنفيذ" }); }
    try { await prisma.idempotencyKey.create({ data: { tenantId: auth.tenantId, key, requestHash } }); } catch { return reply.status(409).send({ error: "العملية قيد التنفيذ" }); }
    try {
      const repair = await prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId }, include: { customer: true, brand: true, branch: true, payments: true, quotes: { orderBy: { version: "desc" } } } });
      if (!repair) throw httpError(404, "أمر الصيانة غير موجود");
      if (!["READY_FOR_DELIVERY", "READY_FOR_RETURN_WITHOUT_REPAIR"].includes(repair.status)) throw httpError(409, "الجهاز غير جاهز للتسليم");
      const finalCharge = repair.status === "READY_FOR_RETURN_WITHOUT_REPAIR" ? 0 : approvedCharge(repair.quotes, Number(repair.estimatedCost));
      const paid = paidTotal(repair.payments); const remaining = Math.max(0, finalCharge - paid); const collected = Number(new Prisma.Decimal(body.collectedAmount));
      if (Math.abs(collected - remaining) > 0.001) throw httpError(422, `المبلغ المطلوب تحصيله هو ${remaining.toFixed(2)}`);
      const result = await prisma.$transaction(async (tx) => {
        if (collected > 0) await tx.payment.create({ data: { repairOrderId: id, amount: new Prisma.Decimal(body.collectedAmount), kind: "COLLECTION", reference: body.reference, createdById: auth.userId } });
        const deliveredAt = new Date();
        await tx.repairOrder.update({ where: { id }, data: { status: "DELIVERED", deliveredAt, unlockKind: null, unlockCiphertext: null, unlockIv: null, unlockAuthTag: null } });
        await tx.repairStatusHistory.create({ data: { repairOrderId: id, fromStatus: repair.status, toStatus: "DELIVERED", reason: "تم التسليم والتحصيل", changedById: auth.userId } });
        await tx.printJob.create({ data: { repairOrderId: id, kind: "DELIVERY_RECEIPT", payload: { paperWidth: "80mm", repairNumber: repair.repairNumber, customer: repair.customer.name, device: `${repair.brand.name} ${repair.model}`, finalCharge, previouslyPaid: paid, collected, remaining: 0, deliveredAt } } });
        await tx.whatsappMessage.create({ data: { repairOrderId: id, tenantId: auth.tenantId, branchId: repair.branchId, type: "DELIVERED", recipient: repair.customer.whatsappPhone ?? repair.customer.phoneNormalized, templateKey: "delivered", variables: { repairNumber: repair.repairNumber, deliveredAt }, idempotencyKey: `repair:${id}:delivered` } });
        await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.delivered", entityType: "repair_order", entityId: id, before: { status: repair.status, paid }, after: { status: "DELIVERED", finalCharge, collected, unlockPurged: true } } });
        return { success: true, repairId: id, repairNumber: repair.repairNumber, status: "DELIVERED", finalCharge, paid: paid + collected, remaining: 0 };
      });
      await prisma.idempotencyKey.update({ where: { tenantId_key: { tenantId: auth.tenantId, key } }, data: { response: result } }); return result;
    } catch (error) { await prisma.idempotencyKey.deleteMany({ where: { tenantId: auth.tenantId, key, response: { equals: Prisma.JsonNull } } }); throw error; }
  });
}

