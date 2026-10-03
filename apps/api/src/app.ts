import Fastify from "fastify";
import cors from "@fastify/cors";
import rawBody from "fastify-raw-body";
import { PrismaClient } from "../generated/client/index.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config } from "./config.js";
import { issueToken, requireAuth } from "./lib/auth.js";
import { registerReceptionRoutes } from "./routes/reception.js";
import { registerWorkflowRoutes } from "./routes/workflow.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerWhatsappWebhookRoutes } from "./routes/whatsapp.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerFinanceRoutes } from "./routes/finance.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";
import { registerExportRoutes } from "./routes/exports.js";

export function buildApp(prisma = new PrismaClient()) {
  const app = Fastify({ logger: true, bodyLimit: 2_000_000 });
  const allowedOrigins = new Set(config.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean));
  app.register(cors, { origin(origin, callback) { callback(null, !origin || allowedOrigins.has(origin)); } });

  app.setErrorHandler((error, request, reply) => {
    const validationError = error instanceof z.ZodError;
    const invalidTransition = (error as Error).message.startsWith("INVALID_TRANSITION:");
    const status = (error as { statusCode?: number }).statusCode ?? (validationError ? 422 : invalidTransition ? 409 : 500);
    if (status >= 500) request.log.error(error);
    const message = status >= 500 ? "حدث خطأ في خادم النظام. حاول مرة أخرى لاحقًا." : validationError ? "البيانات المرسلة غير صحيحة" : invalidTransition ? "لا يمكن تنفيذ انتقال الحالة المطلوب" : (error as Error).message;
    reply.type("application/json").status(status).send({ success: false, code: validationError ? "VALIDATION_ERROR" : invalidTransition ? "INVALID_TRANSITION" : status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED", message, error: message, details: validationError ? error.issues : undefined });
  });

  app.get("/health", async () => ({ status: "ok", service: "repair-api" }));

  app.post("/auth/login", async (request, reply) => {
    const parsed = z.object({ identity: z.string().trim().min(3).optional(), email: z.string().trim().optional(), password: z.string().min(8), tenant: z.string().trim().toLowerCase().min(1) }).refine((value) => Boolean(value.identity || value.email)).safeParse(request.body);
    if (!parsed.success) return reply.status(422).send({ success: false, code: "VALIDATION_ERROR", message: "بيانات تسجيل الدخول غير مكتملة أو غير صحيحة" });
    const body = parsed.data;
    const tenant = await prisma.tenant.findUnique({ where: { slug: body.tenant }, include: { subscriptions: { orderBy: { startsAt: "desc" }, take: 1 } } });
    if (!tenant) return reply.status(404).send({ success: false, code: "INVALID_REPAIR_CENTER", message: "رمز مركز الصيانة غير صحيح" });
    const subscription = tenant.subscriptions[0];
    if (subscription?.status === "SUSPENDED") return reply.status(403).send({ success: false, code: "TENANT_SUSPENDED", message: "تم إيقاف حساب مركز الصيانة. تواصل مع الدعم." });
    if (subscription && (["EXPIRED", "CANCELLED"].includes(subscription.status) || (subscription.endsAt !== null && subscription.endsAt.getTime() < Date.now()))) return reply.status(403).send({ success: false, code: "SUBSCRIPTION_EXPIRED", message: "انتهى اشتراك مركز الصيانة. يرجى تجديد الاشتراك." });
    const identity = (body.identity ?? body.email!).toLowerCase();
    const user = await prisma.user.findFirst({ where: { tenantId: tenant.id, isActive: true, OR: [{ email: identity }, { username: identity }] }, include: { roles: { include: { role: { include: { permissions: true } } } }, branch: true } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) return reply.status(401).send({ success: false, code: "INVALID_CREDENTIALS", message: "بيانات تسجيل الدخول غير صحيحة" });
    const permissions = [...new Set(user.roles.flatMap((item) => item.role.permissions.map((permission) => permission.permissionId)))];
    const token = await issueToken({ userId: user.id, tenantId: user.tenantId, branchId: user.branchId, permissions });
    return { success: true, token, user: { id: user.id, name: user.name, branchId: user.branchId, permissions }, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, primaryColor: tenant.primaryColor }, branch: user.branch ? { id: user.branch.id, name: user.branch.name, code: user.branch.code } : null, permissions };
  });

  app.get("/me", async (request) => requireAuth(request));
  registerOnboardingRoutes(app, prisma);
  registerReceptionRoutes(app, prisma);
  registerWorkflowRoutes(app, prisma);
  registerPublicRoutes(app, prisma);
  registerSettingsRoutes(app, prisma);
  app.register(async (webhookApp) => {
    await webhookApp.register(rawBody, { field: "rawBody", global: false, encoding: false, runFirst: true });
    registerWhatsappWebhookRoutes(webhookApp, prisma);
  });
  registerEventRoutes(app, prisma);
  registerFinanceRoutes(app, prisma);
  registerExportRoutes(app, prisma);
  return app;
}
