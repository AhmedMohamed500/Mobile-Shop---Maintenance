import { normalizeWhatsappPhone } from "@repair/domain";
import { Prisma, type PrismaClient } from "../../generated/client/index.js";
import { config } from "../config.js";
import { MetaWhatsappProvider, MockWhatsappProvider, whatsappReadiness, type WhatsappProvider } from "./adapters.js";

export type LifecycleMessageEvent = "RECEIVED" | "AWAITING_CUSTOMER_APPROVAL" | "UNDER_REPAIR" | "READY_FOR_DELIVERY" | "DELIVERED";
export const lifecycleMessageDefinitions = {
  RECEIVED: { type: "DEVICE_RECEIVED", templateKey: "device_received", label: "استلام الجهاز", variables: ["customerName", "shopName", "brand", "model", "repairNumber", "trackingUrl"] },
  AWAITING_CUSTOMER_APPROVAL: { type: "REPAIR_APPROVAL_REQUESTED", templateKey: "waiting_approval", label: "طلب موافقة العميل", variables: ["customerName", "brand", "model", "repairNumber", "diagnosis", "finalAmount", "approvalUrl", "trackingUrl"] },
  UNDER_REPAIR: { type: "DEVICE_UNDER_REPAIR", templateKey: "under_repair", label: "قيد الصيانة", variables: ["customerName", "brand", "model", "repairNumber", "shopName", "trackingUrl"] },
  READY_FOR_DELIVERY: { type: "DEVICE_READY_FOR_DELIVERY", templateKey: "ready_for_delivery", label: "جاهز للتسليم", variables: ["customerName", "brand", "model", "repairNumber", "branchName", "finalAmount", "paidAmount", "remainingAmount", "trackingUrl"] },
  DELIVERED: { type: "DEVICE_DELIVERED", templateKey: "delivered", label: "تم تسليم الجهاز", variables: ["customerName", "brand", "model", "repairNumber", "shopName", "shopPhone", "warrantyEndDate"] },
} as const;

export const defaultLifecycleTemplates: Record<string, string> = {
  device_received: "مرحباً {customerName}، تم استلام جهازك {brand} {model} في {shopName}. رقم أمر الصيانة: {repairNumber}. متابعة الجهاز: {trackingUrl}",
  waiting_approval: "مرحباً {customerName}، تم فحص جهازك {brand} {model}. التشخيص: {diagnosis}. تكلفة الصيانة: {finalAmount}. الموافقة أو الرفض: {approvalUrl}. المتابعة: {trackingUrl}",
  under_repair: "مرحباً {customerName}، جهازك {brand} {model} رقم {repairNumber} أصبح قيد الصيانة لدى {shopName}. المتابعة: {trackingUrl}",
  ready_for_delivery: "مرحباً {customerName}، جهازك {brand} {model} رقم {repairNumber} جاهز للتسليم من {branchName}. الإجمالي: {finalAmount}. المدفوع: {paidAmount}. {remainingAmount}. المتابعة: {trackingUrl}",
  delivered: "مرحباً {customerName}، تم تسليم جهازك {brand} {model} رقم {repairNumber} بنجاح. شكراً لزيارتكم {shopName}. للتواصل: {shopPhone} {warrantyEndDate}",
};

const allowedTemplateKeys = new Map<string, Set<string>>(Object.values(lifecycleMessageDefinitions).map((item) => [item.templateKey, new Set<string>(item.variables)]));
export function templateValidationErrors(templates: Record<string, string>) {
  const errors: string[] = [];
  for (const [key, text] of Object.entries(templates)) {
    const allowed = allowedTemplateKeys.get(key); if (!allowed) { errors.push(`قالب غير مدعوم: ${key}`); continue; }
    for (const match of text.matchAll(/\{([^{}]+)\}/g)) if (!allowed.has(match[1] as never)) errors.push(`المتغير {${match[1]}} غير مدعوم في ${key}`);
  }
  return errors;
}

export function renderLifecycleTemplate(template: string, variables: Record<string, unknown>) {
  return template.replace(/\{([^{}]+)\}/g, (_, key: string) => String(variables[key] ?? ""));
}

export function trackingUrlFromPrintJobs(printJobs: { payload: unknown }[] | undefined) {
  for (const job of printJobs ?? []) { const payload = job.payload as Record<string, unknown> | null; const value = payload?.trackingUrl ?? payload?.qrValue; if (typeof value === "string" && value.startsWith("http")) return value; }
  return "";
}

type QueueContext = {
  event: LifecycleMessageEvent; repairId: string; tenantId: string; branchId: string; phone: string; whatsappPhone?: string | null; actorId?: string;
  customerName: string; shopName: string; shopPhone?: string | null; branchName: string; repairNumber: string; brand: string; model: string;
  diagnosis?: string; trackingUrl?: string; approvalUrl?: string; finalAmount?: number | string; paidAmount?: number | string; remainingAmount?: number | string; warrantyEndDate?: string;
  idempotencyKey: string;
};

export async function queueLifecycleMessage(tx: Prisma.TransactionClient, context: QueueContext) {
  let recipient: string;
  try { recipient = normalizeWhatsappPhone(context.whatsappPhone || context.phone); }
  catch { await tx.auditLog.create({ data: { tenantId: context.tenantId, actorId: context.actorId, action: "whatsapp.automatic_skipped", entityType: "repair_order", entityId: context.repairId, after: { event: context.event, reason: "INVALID_PHONE" } } }); return { messageId: null, status: "INVALID_PHONE" as const }; }
  const definition = lifecycleMessageDefinitions[context.event];
  const remainingText = Number(context.remainingAmount ?? 0) > 0 ? `المتبقي: ${context.remainingAmount}` : "لا يوجد مبلغ متبقٍ.";
  const allVariables: Record<string, string | number> = {
    customerName: context.customerName, shopName: context.shopName, shopPhone: context.shopPhone ?? "", branchName: context.branchName,
    repairNumber: context.repairNumber, brand: context.brand, model: context.model, diagnosis: context.diagnosis ?? "", trackingUrl: context.trackingUrl ?? "", approvalUrl: context.approvalUrl ?? "",
    finalAmount: context.finalAmount ?? "", paidAmount: context.paidAmount ?? "", remainingAmount: remainingText, warrantyEndDate: context.warrantyEndDate ? `الضمان حتى: ${context.warrantyEndDate}` : "",
  };
  const variables = Object.fromEntries(definition.variables.map((key) => [key, allVariables[key]]));
  const existing = await tx.whatsappMessage.findUnique({ where: { idempotencyKey: context.idempotencyKey }, select: { id: true } });
  const message = await tx.whatsappMessage.upsert({ where: { idempotencyKey: context.idempotencyKey }, update: {}, create: { repairOrderId: context.repairId, tenantId: context.tenantId, branchId: context.branchId, type: definition.type, recipient, templateKey: definition.templateKey, variables, idempotencyKey: context.idempotencyKey } });
  if (!existing) await tx.auditLog.create({ data: { tenantId: context.tenantId, actorId: context.actorId, action: "whatsapp.automatic_queued", entityType: "whatsapp_message", entityId: message.id, after: { event: context.event, templateKey: definition.templateKey } } });
  return { messageId: message.id, status: "QUEUED" as const };
}

export async function dispatchWhatsappMessage(prisma: PrismaClient, messageId: string | null, actorId?: string) {
  if (!messageId) return { status: "INVALID_PHONE" as const };
  const readiness = whatsappReadiness({ provider: config.WHATSAPP_PROVIDER, accessToken: config.META_WHATSAPP_ACCESS_TOKEN, phoneNumberId: config.META_WHATSAPP_PHONE_NUMBER_ID, appSecret: config.META_WHATSAPP_APP_SECRET, verifyToken: config.META_WHATSAPP_VERIFY_TOKEN }, process.env.NODE_ENV === "production");
  if (!readiness.canSend) return { status: "PENDING" as const };
  const message = await prisma.whatsappMessage.findUnique({ where: { id: messageId } }); if (!message) return { status: "PENDING" as const };
  const provider: WhatsappProvider = config.WHATSAPP_PROVIDER === "meta" ? new MetaWhatsappProvider({ accessToken: config.META_WHATSAPP_ACCESS_TOKEN, phoneNumberId: config.META_WHATSAPP_PHONE_NUMBER_ID, graphVersion: config.META_WHATSAPP_GRAPH_VERSION, languageCode: config.META_WHATSAPP_LANGUAGE_CODE }) : new MockWhatsappProvider();
  try {
    await prisma.whatsappMessage.update({ where: { id: message.id }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    const result = await provider.send({ recipient: message.recipient, templateKey: message.templateKey, variables: message.variables as Record<string, unknown> });
    await prisma.whatsappMessage.update({ where: { id: message.id }, data: { status: "SENT", providerMessageId: result.providerMessageId, sentAt: new Date(), failureReason: null } });
    await prisma.auditLog.create({ data: { tenantId: message.tenantId, actorId, action: "whatsapp.provider_accepted", entityType: "whatsapp_message", entityId: message.id, after: { templateKey: message.templateKey, providerMessageId: result.providerMessageId } } });
    return { status: "SENT" as const };
  } catch (error) {
    await prisma.whatsappMessage.update({ where: { id: message.id }, data: { status: "FAILED", failureReason: (error as Error).message.slice(0, 500) } });
    await prisma.auditLog.create({ data: { tenantId: message.tenantId, actorId, action: "whatsapp.provider_failed", entityType: "whatsapp_message", entityId: message.id, after: { templateKey: message.templateKey } } });
    return { status: "FAILED" as const };
  }
}
