import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "../../generated/client/index.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAuth, requirePermission } from "../lib/auth.js";
import { httpError } from "./shared.js";
import { config } from "../config.js";
import { MetaWhatsappProvider, MockWhatsappProvider, type WhatsappProvider } from "../services/adapters.js";

const catalogBody = z.object({ name: z.string().trim().min(2).max(100), sortOrder: z.number().int().min(0).max(10000).default(0), isActive: z.boolean().default(true) });

export function registerSettingsRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/settings/brands", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "brand.manage");
    return prisma.deviceBrand.findMany({ where: { tenantId: auth.tenantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  });
  app.post("/settings/brands", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "brand.manage");
    const body = catalogBody.parse(request.body);
    return reply.status(201).send(await prisma.deviceBrand.create({ data: { tenantId: auth.tenantId, ...body } }));
  });
  app.patch("/settings/brands/:id", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "brand.manage");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = catalogBody.partial().parse(request.body);
    const item = await prisma.deviceBrand.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!item) throw httpError(404, "العلامة التجارية غير موجودة");
    return prisma.deviceBrand.update({ where: { id }, data: body });
  });

  app.get("/settings/faults", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "fault.manage");
    return prisma.faultPreset.findMany({ where: { tenantId: auth.tenantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  });
  app.post("/settings/faults", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "fault.manage");
    const body = catalogBody.parse(request.body);
    return reply.status(201).send(await prisma.faultPreset.create({ data: { tenantId: auth.tenantId, ...body } }));
  });
  app.patch("/settings/faults/:id", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "fault.manage");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = catalogBody.partial().parse(request.body);
    const item = await prisma.faultPreset.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!item) throw httpError(404, "نوع العطل غير موجود");
    return prisma.faultPreset.update({ where: { id }, data: body });
  });

  app.get("/settings/shop", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "settings.manage");
    return prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { name: true, phone: true, whatsapp: true, address: true, logoUrl: true, primaryColor: true, receiptFooter: true, receiptPaperWidth: true, thermalPrinterSettings: true, labelPrinterSettings: true, whatsappSettings: true, workflowSettings: true, messageTemplates: true, timezone: true, currency: true } });
  });
  app.patch("/settings/shop", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "settings.manage");
    const body = z.object({ name: z.string().trim().min(2).max(150).optional(), phone: z.string().max(30).nullable().optional(), whatsapp: z.string().max(30).nullable().optional(), address: z.string().max(300).nullable().optional(), logoUrl: z.string().url().max(500).nullable().optional(), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), receiptFooter: z.string().max(500).nullable().optional(), receiptPaperWidth: z.enum(["58mm", "80mm"]).optional(), thermalPrinterSettings: z.record(z.string(), z.string()).optional(), labelPrinterSettings: z.record(z.string(), z.string()).optional(), whatsappSettings: z.record(z.string(), z.string()).optional(), workflowSettings: z.record(z.string(), z.string()).optional(), messageTemplates: z.record(z.string(), z.string()).optional(), timezone: z.string().max(100).optional(), currency: z.string().length(3).optional() }).parse(request.body);
    const before = await prisma.tenant.findUnique({ where: { id: auth.tenantId } });
    const updated = await prisma.tenant.update({ where: { id: auth.tenantId }, data: body });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "settings.shop_updated", entityType: "tenant", entityId: auth.tenantId, before: before ?? undefined, after: body } });
    return updated;
  });

  app.get("/settings/roles", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "user.manage");
    return prisma.role.findMany({ where: { tenantId: auth.tenantId }, include: { permissions: true }, orderBy: { name: "asc" } });
  });
  app.get("/settings/users", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "user.manage");
    return prisma.user.findMany({ where: { tenantId: auth.tenantId }, select: { id: true, name: true, email: true, branchId: true, isActive: true, roles: { include: { role: { select: { id: true, name: true } } } } }, orderBy: { name: "asc" } });
  });
  app.post("/settings/users", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "user.manage");
    const body = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email(), password: z.string().min(8).max(100), branchId: z.string().uuid().nullable().optional(), roleIds: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const [branch, roles] = await Promise.all([body.branchId ? prisma.branch.findFirst({ where: { id: body.branchId, tenantId: auth.tenantId } }) : Promise.resolve(null), prisma.role.findMany({ where: { id: { in: body.roleIds }, tenantId: auth.tenantId } })]);
    if ((body.branchId && !branch) || roles.length !== new Set(body.roleIds).size) throw httpError(422, "الفرع أو الدور المحدد غير صالح");
    const created = await prisma.user.create({ data: { tenantId: auth.tenantId, branchId: body.branchId, name: body.name, email: body.email.toLowerCase(), passwordHash: await bcrypt.hash(body.password, 12), roles: { create: roles.map((role) => ({ roleId: role.id })) } }, select: { id: true, name: true, email: true, branchId: true, isActive: true } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "user.created", entityType: "user", entityId: created.id, after: { name: created.name, email: created.email, roleIds: body.roleIds } } });
    return reply.status(201).send(created);
  });
  app.patch("/settings/users/:id", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "user.manage");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ name: z.string().trim().min(2).max(100).optional(), isActive: z.boolean().optional(), branchId: z.string().uuid().nullable().optional(), password: z.string().min(8).max(100).optional(), roleIds: z.array(z.string().uuid()).min(1).optional() }).parse(request.body);
    const user = await prisma.user.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!user) throw httpError(404, "المستخدم غير موجود");
    if (id === auth.userId && body.isActive === false) throw httpError(409, "لا يمكنك تعطيل حسابك الحالي");
    if (body.branchId && !(await prisma.branch.findFirst({ where: { id: body.branchId, tenantId: auth.tenantId } }))) throw httpError(422, "الفرع غير صالح");
    if (body.roleIds) {
      const count = await prisma.role.count({ where: { id: { in: body.roleIds }, tenantId: auth.tenantId } });
      if (count !== new Set(body.roleIds).size) throw httpError(422, "أحد الأدوار غير صالح");
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (body.roleIds) { await tx.userRole.deleteMany({ where: { userId: id } }); await tx.userRole.createMany({ data: body.roleIds.map((roleId) => ({ userId: id, roleId })) }); }
      return tx.user.update({ where: { id }, data: { name: body.name, isActive: body.isActive, branchId: body.branchId, passwordHash: body.password ? await bcrypt.hash(body.password, 12) : undefined }, select: { id: true, name: true, email: true, branchId: true, isActive: true } });
    });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "user.updated", entityType: "user", entityId: id, after: { name: body.name, isActive: body.isActive, branchId: body.branchId, roleIds: body.roleIds, passwordChanged: Boolean(body.password) } } });
    return updated;
  });

  app.get("/audit", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "audit.view");
    const { take } = z.object({ take: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
    return prisma.auditLog.findMany({ where: { tenantId: auth.tenantId }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take });
  });
  app.get("/whatsapp/outbox", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "whatsapp.manage");
    return prisma.whatsappMessage.findMany({ where: { tenantId: auth.tenantId }, select: { id: true, repairOrderId: true, type: true, recipient: true, templateKey: true, variables: true, status: true, attempts: true, failureReason: true, sentAt: true, deliveredAt: true, readAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 });
  });

  app.get("/settings/branches", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "settings.manage");
    return prisma.branch.findMany({ where: { tenantId: auth.tenantId }, orderBy: { name: "asc" } });
  });
  app.post("/settings/branches", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "settings.manage");
    const body = z.object({ name: z.string().trim().min(2).max(100), code: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()), address: z.string().max(300).optional(), phone: z.string().max(30).optional() }).parse(request.body);
    return reply.status(201).send(await prisma.branch.create({ data: { tenantId: auth.tenantId, name: body.name, code: String(body.code).toUpperCase(), address: body.address, phone: body.phone } }));
  });
  app.patch("/settings/branches/:id", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "settings.manage"); const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ name: z.string().trim().min(2).max(100).optional(), code: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()).optional(), address: z.string().max(300).nullable().optional(), phone: z.string().max(30).nullable().optional(), isActive: z.boolean().optional() }).parse(request.body);
    if (!(await prisma.branch.findFirst({ where: { id, tenantId: auth.tenantId } }))) throw httpError(404, "الفرع غير موجود");
    return prisma.branch.update({ where: { id }, data: body });
  });

  app.get("/settings/permissions", async (request) => { const auth = await requireAuth(request); requirePermission(auth, "role.manage"); return prisma.permission.findMany({ orderBy: { id: "asc" } }); });
  app.patch("/settings/roles/:id", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "role.manage"); const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const body = z.object({ name: z.string().trim().min(2).max(100).optional(), permissionIds: z.array(z.string()).optional() }).parse(request.body);
    const role = await prisma.role.findFirst({ where: { id, tenantId: auth.tenantId }, include: { permissions: true } }); if (!role) throw httpError(404, "الدور غير موجود");
    if (body.permissionIds) { const valid = await prisma.permission.count({ where: { id: { in: body.permissionIds } } }); if (valid !== new Set(body.permissionIds).size) throw httpError(422, "إحدى الصلاحيات غير صحيحة"); }
    const updated = await prisma.$transaction(async (tx) => { if (body.permissionIds) { await tx.rolePermission.deleteMany({ where: { roleId: id } }); await tx.rolePermission.createMany({ data: body.permissionIds.map((permissionId) => ({ roleId: id, permissionId })) }); } return tx.role.update({ where: { id }, data: { name: body.name }, include: { permissions: true } }); });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "role.updated", entityType: "role", entityId: id, before: { name: role.name, permissionIds: role.permissions.map((item) => item.permissionId) }, after: { name: body.name, permissionIds: body.permissionIds } } }); return updated;
  });

  app.get("/settings/subscription", async (request) => { const auth = await requireAuth(request); requirePermission(auth, "settings.manage"); return prisma.subscription.findFirst({ where: { tenantId: auth.tenantId }, include: { plan: true }, orderBy: { startsAt: "desc" } }); });

  app.post("/whatsapp/:id/resend", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "whatsapp.manage"); const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const message = await prisma.whatsappMessage.findFirst({ where: { id, tenantId: auth.tenantId, status: "FAILED" } }); if (!message) throw httpError(404, "الرسالة الفاشلة غير موجودة");
    const updated = await prisma.whatsappMessage.update({ where: { id }, data: { status: "QUEUED", failureReason: null } });
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, actorId: auth.userId, action: "whatsapp.message_requeued", entityType: "whatsapp_message", entityId: id } }); return updated;
  });
  app.post("/whatsapp/process", async (request) => {
    const auth = await requireAuth(request); requirePermission(auth, "whatsapp.manage");
    const jobs = await prisma.whatsappMessage.findMany({ where: { tenantId: auth.tenantId, status: { in: ["QUEUED", "FAILED"] }, attempts: { lt: 5 } }, orderBy: { createdAt: "asc" }, take: 50 });
    const provider: WhatsappProvider = config.WHATSAPP_PROVIDER === "mock" ? new MockWhatsappProvider() : new MetaWhatsappProvider({ accessToken: config.META_WHATSAPP_ACCESS_TOKEN, phoneNumberId: config.META_WHATSAPP_PHONE_NUMBER_ID, graphVersion: config.META_WHATSAPP_GRAPH_VERSION, languageCode: config.META_WHATSAPP_LANGUAGE_CODE }); let sent = 0; let failed = 0;
    for (const job of jobs) { await prisma.whatsappMessage.update({ where: { id: job.id }, data: { status: "PROCESSING", attempts: { increment: 1 } } }); try { const result = await provider.send({ recipient: job.recipient, templateKey: job.templateKey, variables: job.variables as Record<string, unknown> }); await prisma.whatsappMessage.update({ where: { id: job.id }, data: { status: "SENT", providerMessageId: result.providerMessageId, sentAt: new Date(), failureReason: null } }); sent++; } catch (error) { await prisma.whatsappMessage.update({ where: { id: job.id }, data: { status: "FAILED", failureReason: (error as Error).message.slice(0, 500) } }); failed++; } }
    return { processed: jobs.length, sent, failed };
  });
}
