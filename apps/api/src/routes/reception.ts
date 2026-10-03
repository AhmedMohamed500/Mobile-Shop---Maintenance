import type { FastifyInstance } from "fastify";
import { Prisma, PrismaClient, RepairStatus, PaymentMethod } from "../../generated/client/index.js";
import { z } from "zod";
import { normalizePhone } from "@repair/domain";
import { config } from "../config.js";
import { requireAuth, requirePermission } from "../lib/auth.js";
import { createPublicToken, decryptUnlock, encryptUnlock, hashRequest, hashToken } from "../lib/crypto.js";
import { approvedCharge, httpError, moneyInput, paidTotal, repairInclude, repairJson } from "./shared.js";

const intakeSchema = z.object({
  branchId: z.string().uuid(),
  customer: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().min(8), whatsappPhone: z.string().min(8).optional(), isRegular: z.boolean().default(false), notes: z.string().max(1000).optional() }),
  device: z.object({ brandId: z.string().uuid(), model: z.string().trim().min(1).max(120), color: z.string().max(80).optional(), imei: z.string().max(40).optional() }),
  unlock: z.object({ kind: z.enum(["PIN", "PATTERN"]), value: z.string().min(1).max(128) }).optional(),
  reportedFault: z.string().trim().min(3).max(3000),
  faultPresetIds: z.array(z.string().uuid()).max(20).default([]),
  estimatedCost: moneyInput,
  deposit: moneyInput.default("0"),
  paymentMethod: z.nativeEnum(PaymentMethod).default("CASH"),
});

export function registerReceptionRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/catalog", async (request) => {
    const auth = await requireAuth(request);
    const [brands, faults, branches] = await Promise.all([
      prisma.deviceBrand.findMany({ where: { tenantId: auth.tenantId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.faultPreset.findMany({ where: { tenantId: auth.tenantId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.branch.findMany({ where: { tenantId: auth.tenantId, isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return { brands, faults, branches };
  });

  app.get("/customers", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "customer.manage");
    const { search } = z.object({ search: z.string().optional() }).parse(request.query);
    const normalized = search ? (() => { try { return normalizePhone(search); } catch { return undefined; } })() : undefined;
    return prisma.customer.findMany({
      where: { tenantId: auth.tenantId, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phoneNormalized: { contains: normalized ?? search.replace(/\D/g, "") } }] } : {}) },
      include: { repairs: { select: { id: true, repairNumber: true, status: true, model: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  });

  app.get("/customers/search", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "customer.manage");
    const query = z.object({ phone: z.string() }).parse(request.query);
    return prisma.customer.findUnique({ where: { tenantId_phoneNormalized: { tenantId: auth.tenantId, phoneNormalized: normalizePhone(query.phone) } }, include: { repairs: { select: { id: true, repairNumber: true, status: true, model: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 } } });
  });

  app.post("/customers", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "customer.manage");
    const body = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().min(8), whatsappPhone: z.string().min(8).optional(), isRegular: z.boolean().default(false), notes: z.string().max(1000).optional() }).parse(request.body);
    const phoneNormalized = normalizePhone(body.phone);
    const existing = await prisma.customer.findUnique({ where: { tenantId_phoneNormalized: { tenantId: auth.tenantId, phoneNormalized } } });
    if (existing) return reply.status(200).send(existing);
    const customer = await prisma.customer.create({ data: { tenantId: auth.tenantId, name: body.name, phoneNormalized, phoneDisplay: body.phone, whatsappPhone: body.whatsappPhone ? normalizePhone(body.whatsappPhone) : phoneNormalized, isRegular: body.isRegular, notes: body.notes } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "customer.created", entityType: "customer", entityId: customer.id, after: { name: customer.name, phoneNormalized } } });
    return reply.status(201).send(customer);
  });

  app.patch("/customers/:id", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "customer.manage");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ name: z.string().trim().min(2).max(120).optional(), whatsappPhone: z.string().min(8).nullable().optional(), isRegular: z.boolean().optional(), notes: z.string().max(1000).nullable().optional() }).parse(request.body);
    const current = await prisma.customer.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!current) throw httpError(404, "العميل غير موجود");
    const updated = await prisma.customer.update({ where: { id }, data: { ...body, whatsappPhone: body.whatsappPhone ? normalizePhone(body.whatsappPhone) : body.whatsappPhone } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "customer.updated", entityType: "customer", entityId: id, before: { name: current.name, isRegular: current.isRegular }, after: { name: updated.name, isRegular: updated.isRegular } } });
    return updated;
  });

  app.get("/dashboard/reception", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.view");
    const branch = auth.branchId ? { branchId: auth.branchId } : {};
    const receivedStatuses: RepairStatus[] = ["RECEIVED", "DIAGNOSING", "AWAITING_CUSTOMER_APPROVAL", "CUSTOMER_APPROVED", "UNDER_REPAIR"];
    const readyStatuses: RepairStatus[] = ["READY_FOR_DELIVERY", "READY_FOR_RETURN_WITHOUT_REPAIR"];
    const [received, ready, recentRepairs, readyRepairs] = await Promise.all([
      prisma.repairOrder.count({ where: { tenantId: auth.tenantId, ...branch, status: { in: receivedStatuses } } }),
      prisma.repairOrder.count({ where: { tenantId: auth.tenantId, ...branch, status: { in: readyStatuses } } }),
      prisma.repairOrder.findMany({ where: { tenantId: auth.tenantId, ...branch, status: { in: receivedStatuses } }, include: { customer: true, brand: true }, orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.repairOrder.findMany({ where: { tenantId: auth.tenantId, ...branch, status: { in: readyStatuses } }, include: { customer: true, brand: true, payments: true, quotes: { orderBy: { version: "desc" } } }, orderBy: { updatedAt: "desc" }, take: 20 }),
    ]);
    return {
      received, ready,
      recentRepairs: recentRepairs.map((repair) => ({ ...repair, estimatedCost: Number(repair.estimatedCost) })),
      readyRepairs: readyRepairs.map((repair) => ({ ...repair, estimatedCost: Number(repair.estimatedCost), paid: paidTotal(repair.payments), finalCharge: approvedCharge(repair.quotes, repair.status === "READY_FOR_RETURN_WITHOUT_REPAIR" ? 0 : Number(repair.estimatedCost)) })),
    };
  });

  app.get("/repairs/scan", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.view");
    const { code } = z.object({ code: z.string().trim().min(1).max(500) }).parse(request.query);
    const token = (() => { try { const url = new URL(code); const parts = url.pathname.split("/").filter(Boolean); return parts.includes("r") ? parts[parts.length - 1] : undefined; } catch { return undefined; } })();
    const repair = await prisma.repairOrder.findFirst({ where: { tenantId: auth.tenantId, ...(auth.branchId ? { branchId: auth.branchId } : {}), OR: [{ repairNumber: { equals: code, mode: "insensitive" } }, { imei: { equals: code, mode: "insensitive" } }, ...(token ? [{ publicTokenHash: hashToken(token) }] : [])] }, include: repairInclude });
    if (!repair) throw httpError(404, "لم يتم العثور على أمر الصيانة");
    return repairJson(repair);
  });
  app.get("/repairs", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.view");
    const query = z.object({ status: z.string().optional(), search: z.string().optional() }).parse(request.query);
    const statuses = query.status?.split(",") as RepairStatus[] | undefined;
    const repairs = await prisma.repairOrder.findMany({
      where: { tenantId: auth.tenantId, ...(auth.branchId ? { branchId: auth.branchId } : {}), ...(statuses ? { status: { in: statuses } } : {}), ...(query.search ? { OR: [{ repairNumber: { contains: query.search, mode: "insensitive" } }, { imei: { contains: query.search, mode: "insensitive" } }, { customer: { name: { contains: query.search, mode: "insensitive" } } }, { customer: { phoneNormalized: { contains: query.search.replace(/\D/g, "") } } }] } : {}) },
      include: repairInclude, orderBy: { createdAt: "desc" }, take: 100,
    });
    return repairs.map(repairJson);
  });

  app.get("/repairs/:id", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.view");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const repair = await prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId, ...(auth.branchId ? { branchId: auth.branchId } : {}) }, include: repairInclude });
    if (!repair) throw httpError(404, "أمر الصيانة غير موجود");
    return repairJson(repair);
  });

  app.post("/repairs/intake", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.intake.create");
    const input = intakeSchema.parse(request.body);
    if (auth.branchId && auth.branchId !== input.branchId) return reply.status(403).send({ error: "الفرع غير مسموح" });
    const estimatedCost = new Prisma.Decimal(input.estimatedCost); const deposit = new Prisma.Decimal(input.deposit);
    if (deposit.greaterThan(estimatedCost)) return reply.status(422).send({ error: "العربون لا يمكن أن يتجاوز التكلفة التقديرية" });
    const key = z.string().min(8).max(200).parse(request.headers["idempotency-key"]); const requestHash = hashRequest(input);
    const prior = await prisma.idempotencyKey.findUnique({ where: { tenantId_key: { tenantId: auth.tenantId, key } } });
    if (prior) { if (prior.requestHash !== requestHash) return reply.status(409).send({ error: "مفتاح العملية مستخدم لطلب مختلف" }); if (prior.response) return reply.status(200).send(prior.response); return reply.status(409).send({ error: "العملية قيد التنفيذ" }); }
    try { await prisma.idempotencyKey.create({ data: { tenantId: auth.tenantId, key, requestHash } }); } catch { return reply.status(409).send({ error: "العملية قيد التنفيذ" }); }
    try {
      const publicToken = createPublicToken(); const encrypted = input.unlock ? encryptUnlock(input.unlock.value) : undefined;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${auth.tenantId + new Date().getFullYear()}))`;
        const [branch, brand, validFaults, tenant] = await Promise.all([
          tx.branch.findFirst({ where: { id: input.branchId, tenantId: auth.tenantId, isActive: true } }),
          tx.deviceBrand.findFirst({ where: { id: input.device.brandId, tenantId: auth.tenantId, isActive: true } }),
          tx.faultPreset.count({ where: { id: { in: input.faultPresetIds }, tenantId: auth.tenantId, isActive: true } }),
          tx.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } }),
        ]);
        if (!branch || !brand || validFaults !== input.faultPresetIds.length) throw httpError(422, "بيانات الفرع أو الماركة أو الأعطال غير صحيحة");
        const phoneNormalized = normalizePhone(input.customer.phone);
        const customer = await tx.customer.upsert({ where: { tenantId_phoneNormalized: { tenantId: auth.tenantId, phoneNormalized } }, update: { name: input.customer.name, phoneDisplay: input.customer.phone, whatsappPhone: input.customer.whatsappPhone ? normalizePhone(input.customer.whatsappPhone) : phoneNormalized, isRegular: input.customer.isRegular, notes: input.customer.notes }, create: { tenantId: auth.tenantId, name: input.customer.name, phoneNormalized, phoneDisplay: input.customer.phone, whatsappPhone: input.customer.whatsappPhone ? normalizePhone(input.customer.whatsappPhone) : phoneNormalized, isRegular: input.customer.isRegular, notes: input.customer.notes } });
        const year = new Date().getFullYear(); const last = await tx.repairOrder.findFirst({ where: { tenantId: auth.tenantId, repairNumber: { startsWith: `REP-${year}-` } }, orderBy: { repairNumber: "desc" }, select: { repairNumber: true } });
        const next = last ? Number(last.repairNumber.slice(last.repairNumber.lastIndexOf("-") + 1)) + 1 : 1; const repairNumber = `REP-${year}-${String(next).padStart(6, "0")}`;
        const repair = await tx.repairOrder.create({ data: { tenantId: auth.tenantId, branchId: branch.id, customerId: customer.id, brandId: brand.id, createdById: auth.userId, repairNumber, publicTokenHash: hashToken(publicToken), model: input.device.model, color: input.device.color, imei: input.device.imei, reportedFault: input.reportedFault, unlockKind: input.unlock?.kind, unlockCiphertext: encrypted?.ciphertext, unlockIv: encrypted?.iv, unlockAuthTag: encrypted?.authTag, estimatedCost, faults: { create: input.faultPresetIds.map((faultPresetId) => ({ faultPresetId })) }, statusHistory: { create: { toStatus: "RECEIVED", changedById: auth.userId } } } });
        if (deposit.greaterThan(0)) {
          const shift = await tx.cashShift.findFirst({ where: { tenantId: auth.tenantId, branchId: branch.id, status: "OPEN" } });
          const payment = await tx.payment.create({ data: { repairOrderId: repair.id, amount: deposit, kind: "DEPOSIT", paymentMethod: input.paymentMethod, createdById: auth.userId } });
          await tx.cashTransaction.create({ data: { tenantId: auth.tenantId, branchId: branch.id, shiftId: shift?.id, employeeId: auth.userId, type: "DEPOSIT", direction: "IN", amount: deposit, paymentMethod: input.paymentMethod, sourceType: "repair_payment", sourceId: repair.id, paymentId: payment.id } });
        }
        const trackingUrl = `${config.PUBLIC_TRACKING_URL}/${publicToken}`;
        await tx.printJob.createMany({ data: [{ repairOrderId: repair.id, kind: "RECEIPT", payload: { paperWidth: tenant.receiptPaperWidth, shopLogo: tenant.logoUrl, shopName: tenant.name, receiptFooter: tenant.receiptFooter, repairNumber, branch: branch.name, customer: customer.name, phone: customer.phoneDisplay, brand: brand.name, model: repair.model, color: repair.color, imei: repair.imei, fault: repair.reportedFault, estimatedCost: Number(estimatedCost), deposit: Number(deposit), estimatedRemaining: Number(estimatedCost.minus(deposit)), qrValue: trackingUrl, trackingUrl } }, { repairOrderId: repair.id, kind: "LABEL", payload: { repairNumber, brand: brand.name, model: repair.model, customer: customer.name, intakeDate: repair.createdAt, qrValue: trackingUrl } }] });
        await tx.whatsappMessage.create({ data: { repairOrderId: repair.id, tenantId: auth.tenantId, branchId: branch.id, type: "DEVICE_RECEIVED", recipient: customer.whatsappPhone ?? phoneNormalized, templateKey: "device_received", variables: { customerName: customer.name, repairNumber, device: `${brand.name} ${repair.model}`, trackingUrl }, idempotencyKey: `repair:${repair.id}:received` } });
        await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.created", entityType: "repair_order", entityId: repair.id, after: { repairNumber, branchId: branch.id, status: "RECEIVED" } } }); await tx.systemEvent.create({ data: { tenantId: auth.tenantId, branchId: branch.id, type: "repair.created", entityId: repair.id, payload: { repairNumber, status: "RECEIVED" } } });
        return { repairId: repair.id, repairNumber, trackingUrl, printJobsQueued: 2, whatsappQueued: true };
      });
      await prisma.idempotencyKey.update({ where: { tenantId_key: { tenantId: auth.tenantId, key } }, data: { response: result } }); return reply.status(201).send(result);
    } catch (error) { await prisma.idempotencyKey.deleteMany({ where: { tenantId: auth.tenantId, key, response: { equals: Prisma.JsonNull } } }); throw error; }
  });

  app.post("/repairs/:id/unlock/reveal", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.unlock.view"); const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const repair = await prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId } }); if (!repair) throw httpError(404, "أمر الصيانة غير موجود"); if (!repair.unlockCiphertext || !repair.unlockIv || !repair.unlockAuthTag) return { value: null };
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.unlock_revealed", entityType: "repair_order", entityId: id, ipAddress: request.ip } }); return { kind: repair.unlockKind, value: decryptUnlock(repair.unlockCiphertext, repair.unlockIv, repair.unlockAuthTag) };
  });

  app.get("/print-jobs/pending", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.view"); const { branchId } = z.object({ branchId: z.string().uuid().optional() }).parse(request.query);
    const scopedBranch = auth.branchId ?? branchId; if (!scopedBranch) throw httpError(422, "حدد الفرع لمحطة الطباعة");
    return prisma.printJob.findMany({ where: { status: "QUEUED", repairOrder: { tenantId: auth.tenantId, branchId: scopedBranch } }, select: { id: true, repairOrderId: true, kind: true, payload: true, status: true, attempts: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 50 });
  });
  app.post("/print-jobs/:id/result", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.view"); const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const body = z.object({ status: z.enum(["COMPLETED", "FAILED"]), printerName: z.string().trim().min(1).max(300), workstationId: z.string().trim().min(4).max(200), error: z.string().max(1000).optional() }).parse(request.body);
    const job = await prisma.printJob.findFirst({ where: { id, repairOrder: { tenantId: auth.tenantId, ...(auth.branchId ? { branchId: auth.branchId } : {}) } } }); if (!job) throw httpError(404, "مهمة الطباعة غير موجودة"); if (job.status === "COMPLETED") return job;
    const updated = await prisma.printJob.update({ where: { id }, data: { status: body.status, attempts: { increment: 1 }, printerName: body.printerName, workstationId: body.workstationId, failureReason: body.status === "FAILED" ? body.error ?? "تعذر تنفيذ الطباعة" : null, printedAt: body.status === "COMPLETED" ? new Date() : null } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: body.status === "COMPLETED" ? "print.completed" : "print.failed", entityType: "print_job", entityId: id, after: { printerName: body.printerName, workstationId: body.workstationId, error: body.error } } }); return updated;
  });
  app.get("/repairs/:id/print-jobs", async (request) => { const auth = await requireAuth(request); requirePermission(auth, "repair.view"); const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const repair = await prisma.repairOrder.findFirst({ where: { id, tenantId: auth.tenantId } }); if (!repair) throw httpError(404, "أمر الصيانة غير موجود"); return prisma.printJob.findMany({ where: { repairOrderId: id }, orderBy: { createdAt: "desc" } }); });
  app.post("/print-jobs/:id/reprint", async (request, reply) => { const auth = await requireAuth(request); requirePermission(auth, "printer.manage"); const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const job = await prisma.printJob.findFirst({ where: { id, repairOrder: { tenantId: auth.tenantId } } }); if (!job) throw httpError(404, "مهمة الطباعة غير موجودة"); const reprint = await prisma.$transaction(async (tx) => { const created = await tx.printJob.create({ data: { repairOrderId: job.repairOrderId, kind: job.kind, payload: job.payload === null ? Prisma.JsonNull : job.payload, status: "QUEUED" } }); await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: job.kind === "LABEL" ? "label.reprinted" : "receipt.reprinted", entityType: "print_job", entityId: created.id, after: { sourceJobId: id, kind: job.kind } } }); return created; }); return reply.status(201).send(reprint); });
}
