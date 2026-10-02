import Fastify from "fastify";
import cors from "@fastify/cors";
import { Prisma, PrismaClient, RepairStatus } from "../generated/client/index.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { assertTransition, normalizePhone } from "@repair/domain";
import { config } from "./config.js";
import { issueToken, requireAuth, requirePermission } from "./lib/auth.js";
import { createPublicToken, decryptUnlock, encryptUnlock, hashRequest, hashToken } from "./lib/crypto.js";

const intakeSchema = z.object({
  branchId: z.string().uuid(),
  customer: z.object({ name: z.string().min(2).max(120), phone: z.string().min(8), isRegular: z.boolean().default(false) }),
  device: z.object({ brandId: z.string().uuid(), model: z.string().min(1).max(120), color: z.string().max(80).optional(), imei: z.string().max(40).optional() }),
  unlock: z.object({ kind: z.enum(["PIN", "PATTERN"]), value: z.string().min(1).max(128) }).optional(),
  reportedFault: z.string().min(3).max(3000),
  faultPresetIds: z.array(z.string().uuid()).max(20).default([]),
  estimatedCost: z.number().nonnegative().multipleOf(0.01),
  deposit: z.number().nonnegative().multipleOf(0.01).default(0),
});

export function buildApp(prisma = new PrismaClient()) {
  const app = Fastify({ logger: true, bodyLimit: 2_000_000 });
  const allowedOrigins = new Set(config.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean));
  app.register(cors, {
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
  });

  app.setErrorHandler((error, request, reply) => {
    const validationError = error instanceof z.ZodError;
    const status = (error as { statusCode?: number }).statusCode ?? (validationError ? 422 : 500);
    if (status >= 500) request.log.error(error);
    const message = status >= 500
      ? "حدث خطأ في خادم النظام. حاول مرة أخرى لاحقًا."
      : validationError ? "البيانات المرسلة غير صحيحة" : (error as Error).message;
    reply.type("application/json").status(status).send({
      success: false,
      code: validationError ? "VALIDATION_ERROR" : status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED",
      message,
      error: message,
      details: validationError ? error.issues : undefined,
    });
  });

  app.get("/health", async () => ({ status: "ok", service: "repair-api" }));

  app.post("/auth/login", async (request, reply) => {
    const parsed = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      tenant: z.string().trim().min(1),
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ success: false, code: "VALIDATION_ERROR", message: "بيانات تسجيل الدخول غير مكتملة أو غير صحيحة" });
    }

    const body = parsed.data;
    const tenant = await prisma.tenant.findUnique({
      where: { slug: body.tenant },
      include: { subscriptions: { orderBy: { startsAt: "desc" }, take: 1 } },
    });
    if (!tenant) {
      return reply.status(404).send({ success: false, code: "INVALID_REPAIR_CENTER", message: "رمز مركز الصيانة غير صحيح" });
    }

    const subscription = tenant.subscriptions[0];
    if (subscription?.status === "SUSPENDED") {
      return reply.status(403).send({ success: false, code: "TENANT_SUSPENDED", message: "تم إيقاف حساب مركز الصيانة. تواصل مع الدعم." });
    }
    const subscriptionExpired = subscription && (
      ["EXPIRED", "CANCELLED"].includes(subscription.status) ||
      (subscription.endsAt !== null && subscription.endsAt.getTime() < Date.now())
    );
    if (subscriptionExpired) {
      return reply.status(403).send({ success: false, code: "SUBSCRIPTION_EXPIRED", message: "انتهى اشتراك مركز الصيانة. يرجى تجديد الاشتراك." });
    }

    const user = await prisma.user.findFirst({
      where: { email: body.email.toLowerCase(), tenantId: tenant.id, isActive: true },
      include: { roles: { include: { role: { include: { permissions: true } } } }, branch: true },
    });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.status(401).send({ success: false, code: "INVALID_CREDENTIALS", message: "بيانات تسجيل الدخول غير صحيحة" });
    }

    const permissions = [...new Set(user.roles.flatMap((item) => item.role.permissions.map((permission) => permission.permissionId)))];
    const token = await issueToken({ userId: user.id, tenantId: user.tenantId, branchId: user.branchId, permissions });
    return {
      success: true,
      token,
      user: { id: user.id, name: user.name, branchId: user.branchId, permissions },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, primaryColor: tenant.primaryColor },
      branch: user.branch ? { id: user.branch.id, name: user.branch.name, code: user.branch.code } : null,
      permissions,
    };
  });

  app.get("/me", async (request) => requireAuth(request));

  app.get("/catalog", async (request) => {
    const auth = await requireAuth(request);
    const [brands, faults, branches] = await Promise.all([
      prisma.deviceBrand.findMany({ where: { tenantId: auth.tenantId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.faultPreset.findMany({ where: { tenantId: auth.tenantId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.branch.findMany({ where: { tenantId: auth.tenantId, isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return { brands, faults, branches };
  });

  app.get("/customers/search", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "customer.manage");
    const query = z.object({ phone: z.string() }).parse(request.query);
    const phoneNormalized = normalizePhone(query.phone);
    return prisma.customer.findUnique({ where: { tenantId_phoneNormalized: { tenantId: auth.tenantId, phoneNormalized } }, include: { repairs: { select: { repairNumber: true, status: true, model: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 } } });
  });

  app.get("/dashboard/reception", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.view");
    const branch = auth.branchId ? { branchId: auth.branchId } : {};
    const [received, ready] = await Promise.all([
      prisma.repairOrder.count({ where: { tenantId: auth.tenantId, ...branch, status: { in: ["RECEIVED", "DIAGNOSING", "AWAITING_CUSTOMER_APPROVAL", "CUSTOMER_APPROVED", "UNDER_REPAIR"] } } }),
      prisma.repairOrder.count({ where: { tenantId: auth.tenantId, ...branch, status: { in: ["READY_FOR_DELIVERY", "READY_FOR_RETURN_WITHOUT_REPAIR"] } } }),
    ]);
    return { received, ready };
  });

  app.get("/repairs", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.view");
    const query = z.object({ status: z.string().optional(), search: z.string().optional() }).parse(request.query);
    const statuses = query.status?.split(",") as RepairStatus[] | undefined;
    return prisma.repairOrder.findMany({
      where: { tenantId: auth.tenantId, ...(auth.branchId ? { branchId: auth.branchId } : {}), ...(statuses ? { status: { in: statuses } } : {}), ...(query.search ? { OR: [{ repairNumber: { contains: query.search, mode: "insensitive" } }, { customer: { name: { contains: query.search, mode: "insensitive" } } }, { customer: { phoneNormalized: { contains: query.search.replace(/\D/g, "") } } }] } : {}) },
      include: { customer: { select: { name: true, phoneDisplay: true } }, brand: { select: { name: true } }, statusHistory: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 100,
    });
  });

  app.post("/repairs/intake", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.intake.create");
    const input = intakeSchema.parse(request.body);
    if (auth.branchId && auth.branchId !== input.branchId) return reply.status(403).send({ error: "الفرع غير مسموح" });
    if (input.deposit > input.estimatedCost) return reply.status(422).send({ error: "العربون لا يمكن أن يتجاوز التكلفة التقديرية" });
    const key = z.string().min(8).max(200).parse(request.headers["idempotency-key"]);
    const requestHash = hashRequest(input);
    const prior = await prisma.idempotencyKey.findUnique({ where: { tenantId_key: { tenantId: auth.tenantId, key } } });
    if (prior) {
      if (prior.requestHash !== requestHash) return reply.status(409).send({ error: "مفتاح العملية مستخدم لطلب مختلف" });
      if (prior.response) return reply.status(200).send(prior.response);
      return reply.status(409).send({ error: "العملية قيد التنفيذ" });
    }
    try { await prisma.idempotencyKey.create({ data: { tenantId: auth.tenantId, key, requestHash } }); }
    catch { return reply.status(409).send({ error: "العملية قيد التنفيذ" }); }

    try {
      const publicToken = createPublicToken();
      const encrypted = input.unlock ? encryptUnlock(input.unlock.value) : undefined;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${auth.tenantId + new Date().getFullYear()}))`;
        const branch = await tx.branch.findFirstOrThrow({ where: { id: input.branchId, tenantId: auth.tenantId, isActive: true } });
        const brand = await tx.deviceBrand.findFirstOrThrow({ where: { id: input.device.brandId, tenantId: auth.tenantId, isActive: true } });
        const phoneNormalized = normalizePhone(input.customer.phone);
        const customer = await tx.customer.upsert({ where: { tenantId_phoneNormalized: { tenantId: auth.tenantId, phoneNormalized } }, update: { name: input.customer.name, phoneDisplay: input.customer.phone, isRegular: input.customer.isRegular }, create: { tenantId: auth.tenantId, name: input.customer.name, phoneNormalized, phoneDisplay: input.customer.phone, isRegular: input.customer.isRegular } });
        const year = new Date().getFullYear();
        const last = await tx.repairOrder.findFirst({ where: { tenantId: auth.tenantId, repairNumber: { startsWith: `REP-${year}-` } }, orderBy: { repairNumber: "desc" }, select: { repairNumber: true } });
        const next = last ? Number(last.repairNumber.slice(last.repairNumber.lastIndexOf("-") + 1)) + 1 : 1;
        const repairNumber = `REP-${year}-${String(next).padStart(6, "0")}`;
        const repair = await tx.repairOrder.create({ data: { tenantId: auth.tenantId, branchId: branch.id, customerId: customer.id, brandId: brand.id, createdById: auth.userId, repairNumber, publicTokenHash: hashToken(publicToken), model: input.device.model, color: input.device.color, imei: input.device.imei, reportedFault: input.reportedFault, unlockKind: input.unlock?.kind, unlockCiphertext: encrypted?.ciphertext, unlockIv: encrypted?.iv, unlockAuthTag: encrypted?.authTag, estimatedCost: new Prisma.Decimal(input.estimatedCost), faults: { create: input.faultPresetIds.map((faultPresetId) => ({ faultPresetId })) }, statusHistory: { create: { toStatus: "RECEIVED", changedById: auth.userId } }, ...(input.deposit > 0 ? { payments: { create: { amount: new Prisma.Decimal(input.deposit), kind: "DEPOSIT" } } } : {}) } });
        const trackingUrl = `${config.PUBLIC_TRACKING_URL}/${publicToken}`;
        const printPayload = { repairNumber, branch: branch.name, customer: customer.name, phone: customer.phoneDisplay, brand: brand.name, model: repair.model, color: repair.color, imei: repair.imei, fault: repair.reportedFault, estimatedCost: input.estimatedCost, deposit: input.deposit, estimatedRemaining: input.estimatedCost - input.deposit, trackingUrl };
        await tx.printJob.createMany({ data: [{ repairOrderId: repair.id, kind: "RECEIPT", payload: printPayload }, { repairOrderId: repair.id, kind: "LABEL", payload: { repairNumber, brand: brand.name, model: repair.model, customer: customer.name, intakeDate: repair.createdAt, trackingUrl } }] });
        await tx.whatsappMessage.create({ data: { repairOrderId: repair.id, tenantId: auth.tenantId, branchId: branch.id, type: "DEVICE_RECEIVED", recipient: phoneNormalized, templateKey: "device_received", variables: { customerName: customer.name, repairNumber, device: `${brand.name} ${repair.model}`, status: "تم الاستلام", trackingUrl }, idempotencyKey: `repair:${repair.id}:received` } });
        await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.created", entityType: "repair_order", entityId: repair.id, after: { repairNumber, branchId: branch.id, status: "RECEIVED" } } });
        return { repairId: repair.id, repairNumber, trackingUrl, printJobsQueued: 2, whatsappQueued: true };
      });
      await prisma.idempotencyKey.update({ where: { tenantId_key: { tenantId: auth.tenantId, key } }, data: { response: result } });
      return reply.status(201).send(result);
    } catch (error) {
      await prisma.idempotencyKey.deleteMany({ where: { tenantId: auth.tenantId, key, response: { equals: Prisma.JsonNull } } });
      throw error;
    }
  });

  app.post("/repairs/:id/status", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.status.change");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: z.enum(["RECEIVED", "DIAGNOSING", "AWAITING_CUSTOMER_APPROVAL", "CUSTOMER_APPROVED", "CUSTOMER_DECLINED", "UNDER_REPAIR", "READY_FOR_DELIVERY", "READY_FOR_RETURN_WITHOUT_REPAIR", "DELIVERED", "CANCELLED"]), reason: z.string().max(500).optional() }).parse(request.body);
    const repair = await prisma.repairOrder.findFirstOrThrow({ where: { id, tenantId: auth.tenantId } });
    assertTransition(repair.status, body.status);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.repairOrder.update({ where: { id }, data: { status: body.status, ...(body.status === "DELIVERED" ? { deliveredAt: new Date(), unlockKind: null, unlockCiphertext: null, unlockIv: null, unlockAuthTag: null } : {}) } });
      await tx.repairStatusHistory.create({ data: { repairOrderId: id, fromStatus: repair.status, toStatus: body.status, reason: body.reason, changedById: auth.userId } });
      await tx.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.status_changed", entityType: "repair_order", entityId: id, before: { status: repair.status }, after: { status: body.status, unlockPurged: body.status === "DELIVERED" } } });
      return updated;
    });
  });

  app.post("/repairs/:id/unlock/reveal", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "repair.unlock.view");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const repair = await prisma.repairOrder.findFirstOrThrow({ where: { id, tenantId: auth.tenantId } });
    if (!repair.unlockCiphertext || !repair.unlockIv || !repair.unlockAuthTag) return { value: null };
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "repair.unlock_revealed", entityType: "repair_order", entityId: id, ipAddress: request.ip } });
    return { kind: repair.unlockKind, value: decryptUnlock(repair.unlockCiphertext, repair.unlockIv, repair.unlockAuthTag) };
  });

  app.get("/public/tracking/:token", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(30).max(100) }).parse(request.params);
    const repair = await prisma.repairOrder.findUnique({ where: { publicTokenHash: hashToken(token) }, include: { tenant: { select: { name: true, logoUrl: true, primaryColor: true, phone: true } }, branch: { select: { name: true, address: true, phone: true } }, brand: { select: { name: true } }, statusHistory: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: "asc" } }, payments: { select: { amount: true, kind: true } } } });
    if (!repair) return reply.status(404).send({ error: "طلب الصيانة غير موجود" });
    const paid = repair.payments.reduce((sum, p) => sum + (p.kind === "REFUND" || p.kind === "REVERSAL" ? -Number(p.amount) : Number(p.amount)), 0);
    return { shop: repair.tenant, branch: repair.branch, repairNumber: repair.repairNumber, device: { brand: repair.brand.name, model: repair.model }, status: repair.status, timeline: repair.statusHistory, lastUpdate: repair.updatedAt, estimatedCost: Number(repair.estimatedCost), paid };
  });

  return app;
}
