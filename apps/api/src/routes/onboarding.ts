import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "../../generated/client/index.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { permissions, normalizePhone } from "@repair/domain";
import { config } from "../config.js";
import { hashRequest } from "../lib/crypto.js";
import { httpError } from "./shared.js";

function validPhone(value: string) { try { normalizePhone(value); return true; } catch { return false; } }
const phoneSchema = z.string().trim().min(8).max(30).refine(validPhone, "INVALID_PHONE");
const workstationSchema = z.object({ name: z.string().trim().min(2).max(80), type: z.enum(["RECEPTION", "RECEPTION_DELIVERY", "WORKSHOP", "WORKSHOP_MANAGEMENT", "CASHIER", "ACCOUNTING", "MANAGER", "MANAGEMENT", "MULTIPURPOSE"]), count: z.number().int().min(1).max(20).default(1), defaultPage: z.enum(["dashboard", "intake", "workshop", "delivery", "finance"]).default("dashboard") });
const branchSchema = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,20}$/).transform((x) => x.toUpperCase()), address: z.string().trim().max(300).optional(), phone: phoneSchema.optional(), whatsapp: phoneSchema.optional(), workstations: z.array(workstationSchema).min(1).max(12) });
const setupSchema = z.object({
  owner: z.object({ fullName: z.string().trim().min(3).max(120), username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/), email: z.string().trim().toLowerCase().email(), phone: phoneSchema, whatsapp: phoneSchema, password: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/) }),
  shop: z.object({ name: z.string().trim().min(2).max(150), code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/), phone: phoneSchema, whatsapp: phoneSchema, address: z.string().trim().min(3).max(300), governorate: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(80), notes: z.string().trim().max(1000).optional(), logoDataUrl: z.string().max(400_000).optional() }),
  branches: z.array(branchSchema).min(1).max(5),
  defaults: z.object({ currency: z.enum(["EGP", "SAR", "AED", "USD"]).default("EGP"), timezone: z.string().min(3).max(100).default("Africa/Cairo"), paperWidth: z.enum(["58mm", "80mm"]).default("80mm"), warrantyDays: z.number().int().min(0).max(730).default(30), whatsappMode: z.enum(["later", "meta"]).default("later") }),
  subscription: z.object({ planCode: z.string().trim().min(2).max(40).default("STARTER"), billingCycle: z.enum(["TRIAL", "MONTHLY", "YEARLY"]).default("TRIAL") }),
  acceptedTerms: z.literal(true),
});

const brands = ["Apple", "Samsung", "Xiaomi", "Oppo", "Realme", "Huawei", "Nokia"];
const faults = ["الشاشة", "البطارية", "الشحن", "سوكت الشحن", "الكاميرا", "السماعة", "الميكروفون", "الشبكة", "البوردة", "السوفت وير", "مشكلة مياه", "لا يعمل"];
const signupAttempts = new Map<string, { count: number; resetAt: number }>();
function setupValidationMessage(issue: z.core.$ZodIssue) {
  const path = issue.path.map(String); const key = path.filter((item) => !/^\d+$/.test(item)).join(".");
  const labels: Record<string, string> = { "owner.fullName": "الاسم بالكامل", "owner.username": "اسم المستخدم", "owner.email": "البريد الإلكتروني", "owner.phone": "هاتف صاحب المركز", "owner.whatsapp": "واتساب صاحب المركز", "owner.password": "كلمة المرور", "shop.name": "اسم مركز الصيانة", "shop.code": "رمز المركز", "shop.phone": "هاتف المركز", "shop.whatsapp": "واتساب المركز", "shop.address": "عنوان المركز", "shop.governorate": "المحافظة", "shop.city": "المدينة", "branches.name": "اسم الفرع", "branches.code": "كود الفرع", "branches.phone": "هاتف الفرع", "branches.whatsapp": "واتساب الفرع", "branches.workstations.name": "اسم محطة العمل", "branches.workstations.count": "عدد محطات العمل", "acceptedTerms": "تأكيد صحة البيانات" };
  const label = labels[key] ?? "أحد الحقول"; const branchNumber = path[0] === "branches" && /^\d+$/.test(path[1] ?? "") ? ` في الفرع رقم ${Number(path[1]) + 1}` : "";
  if (issue.message === "INVALID_PHONE") return `رقم ${label}${branchNumber} غير صحيح. استخدم رقمًا مثل 01012345678`;
  if (key === "owner.password") return "كلمة المرور يجب أن تكون 10 أحرف على الأقل وتحتوي حرفًا كبيرًا وصغيرًا ورقمًا";
  if (key.endsWith("code")) return `${label}${branchNumber} غير صالح. استخدم حروفًا إنجليزية وأرقامًا فقط`;
  return `راجع حقل ${label}${branchNumber}؛ القيمة ناقصة أو غير صحيحة`;
}

function validateLogo(data?: string) {
  if (!data) return undefined;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match) throw httpError(422, "صيغة شعار المركز غير مدعومة. استخدم PNG أو JPEG أو WebP");
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > 256_000) throw httpError(422, "حجم الشعار يجب ألا يتجاوز 250 كيلوبايت");
  const ok = match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === "jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (!ok) throw httpError(422, "محتوى ملف الشعار غير صالح");
  return data;
}

export function registerOnboardingRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/public/setup/config", async () => ({ enabled: config.PUBLIC_SIGNUP_ENABLED, plans: await prisma.plan.findMany({ select: { code: true, name: true, monthlyPrice: true, yearlyPrice: true }, orderBy: { monthlyPrice: "asc" } }) }));
  app.get("/public/setup/check-code", async (request) => { const { code } = z.object({ code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/) }).parse(request.query); return { available: !(await prisma.tenant.findUnique({ where: { slug: code }, select: { id: true } })) }; });
  app.post("/public/setup", async (request, reply) => {
    if (!config.PUBLIC_SIGNUP_ENABLED) return reply.status(404).send({ success: false, code: "SIGNUP_DISABLED", message: "إنشاء المراكز الجديدة غير متاح حاليًا" });
    const now = Date.now(); const previous = signupAttempts.get(request.ip); const rate = !previous || previous.resetAt < now ? { count: 1, resetAt: now + 15 * 60_000 } : { ...previous, count: previous.count + 1 }; signupAttempts.set(request.ip, rate);
    if (rate.count > 8) return reply.status(429).send({ success: false, code: "RATE_LIMITED", message: "محاولات كثيرة. حاول مرة أخرى بعد قليل" });
    const parsed = setupSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(422).send({ success: false, code: "SETUP_VALIDATION_ERROR", message: setupValidationMessage(parsed.error.issues[0]!) });
    const input = parsed.data; const logoUrl = validateLogo(input.shop.logoDataUrl); const key = z.string().uuid().parse(request.headers["idempotency-key"]); const requestHash = hashRequest(input);
    const prior = await prisma.onboardingRequest.findUnique({ where: { idempotencyKey: key } });
    if (prior) { if (prior.requestHash !== requestHash) throw httpError(409, "مفتاح العملية مستخدم لطلب مختلف"); if (prior.response) return reply.status(200).send(prior.response); throw httpError(409, "عملية إنشاء المركز قيد التنفيذ"); }
    const existing = await prisma.tenant.findUnique({ where: { slug: input.shop.code }, select: { id: true } }); if (existing) return reply.status(409).send({ success: false, code: "CENTER_CODE_TAKEN", message: "رمز المركز مستخدم بالفعل" });
    const passwordHash = await bcrypt.hash(input.owner.password, 12);
    const response = await prisma.$transaction(async (tx) => {
      await tx.onboardingRequest.create({ data: { idempotencyKey: key, requestHash } });
      const plan = await tx.plan.upsert({ where: { code: input.subscription.planCode }, update: {}, create: { code: input.subscription.planCode, name: input.subscription.planCode === "STARTER" ? "Starter" : input.subscription.planCode, monthlyPrice: 799, yearlyPrice: 7990, limits: { branches: 5, employees: 30, monthlyRepairs: 5000, whatsapp: true } } });
      const tenant = await tx.tenant.create({ data: { name: input.shop.name, slug: input.shop.code, phone: normalizePhone(input.shop.phone), whatsapp: normalizePhone(input.shop.whatsapp), address: input.shop.address, governorate: input.shop.governorate, city: input.shop.city, notes: input.shop.notes, logoUrl, currency: input.defaults.currency, timezone: input.defaults.timezone, receiptPaperWidth: input.defaults.paperWidth, defaultWarrantyDays: input.defaults.warrantyDays, whatsappSettings: { mode: input.defaults.whatsappMode, configured: false }, onboardingCompletedAt: new Date() } });
      const createdBranches = [];
      for (let index = 0; index < input.branches.length; index++) { const branch = await tx.branch.create({ data: { tenantId: tenant.id, name: input.branches[index]!.name, code: input.branches[index]!.code, address: input.branches[index]!.address, phone: input.branches[index]!.phone ? normalizePhone(input.branches[index]!.phone!) : null, whatsapp: input.branches[index]!.whatsapp ? normalizePhone(input.branches[index]!.whatsapp!) : null, isPrimary: index === 0 } }); createdBranches.push(branch); const rows = input.branches[index]!.workstations.flatMap((item) => Array.from({ length: item.count }, (_, n) => ({ tenantId: tenant.id, branchId: branch.id, name: item.count === 1 ? item.name : `${item.name} ${n + 1}`, type: item.type, defaultPage: item.defaultPage }))); await tx.workstation.createMany({ data: rows }); }
      for (const id of permissions) await tx.permission.upsert({ where: { id }, update: {}, create: { id, description: id } });
      const ownerRole = await tx.role.create({ data: { tenantId: tenant.id, name: "owner", isSystem: true, permissions: { create: permissions.map((permissionId) => ({ permissionId })) } } });
      const user = await tx.user.create({ data: { tenantId: tenant.id, branchId: createdBranches[0]!.id, name: input.owner.fullName, username: input.owner.username, email: input.owner.email, phone: normalizePhone(input.owner.phone), whatsapp: normalizePhone(input.owner.whatsapp), passwordHash, roles: { create: { roleId: ownerRole.id } } } });
      await tx.deviceBrand.createMany({ data: brands.map((name, sortOrder) => ({ tenantId: tenant.id, name, sortOrder })) }); await tx.faultPreset.createMany({ data: faults.map((name, sortOrder) => ({ tenantId: tenant.id, name, sortOrder })) });
      const cycle = input.subscription.billingCycle; const endsAt = new Date(Date.now() + 14 * 86_400_000); await tx.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: "TRIAL", billingCycle: cycle, startsAt: new Date(), endsAt } });
      await tx.auditLog.create({ data: { tenantId: tenant.id, actorId: user.id, action: "tenant.onboarding_completed", entityType: "tenant", entityId: tenant.id, after: { branchCount: createdBranches.length, plan: plan.code, billingCycle: cycle } } });
      const result = { success: true, centerCode: tenant.slug, identity: user.username, email: user.email, tenantId: tenant.id }; await tx.onboardingRequest.update({ where: { idempotencyKey: key }, data: { response: result } }); return result;
    }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return reply.status(201).send(response);
  });
}
