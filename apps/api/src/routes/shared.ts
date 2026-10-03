import { Prisma } from "../../generated/client/index.js";
import { z } from "zod";
import { config } from "../config.js";

export const moneyInput = z.union([z.string(), z.number()]).transform(String).refine((value) => /^\d+(\.\d{1,2})?$/.test(value), "INVALID_MONEY");
export const statusSchema = z.enum(["RECEIVED", "DIAGNOSING", "AWAITING_CUSTOMER_APPROVAL", "CUSTOMER_APPROVED", "CUSTOMER_DECLINED", "UNDER_REPAIR", "READY_FOR_DELIVERY", "READY_FOR_RETURN_WITHOUT_REPAIR", "DELIVERED", "CANCELLED"]);
export const repairInclude = {
  customer: true,
  brand: true,
  branch: true,
  faults: { include: { faultPreset: true } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: { createdAt: "asc" as const } },
  quotes: { include: { decision: true }, orderBy: { version: "desc" as const } },
  notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" as const } },
  assignments: { include: { technician: { select: { id: true, name: true } } }, orderBy: { assignedAt: "desc" as const } },
  printJobs: { orderBy: { createdAt: "desc" as const } },
  whatsappMessages: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.RepairOrderInclude;

export type RepairView = Prisma.RepairOrderGetPayload<{ include: typeof repairInclude }>;
export type PaymentLike = { amount: Prisma.Decimal; kind: string };
export type QuoteLike = { amount: Prisma.Decimal; status: string; version: number };

export function paidTotal(payments: PaymentLike[]) {
  return payments.reduce((sum, payment) => sum + (["REFUND", "REVERSAL"].includes(payment.kind) ? -Number(payment.amount) : Number(payment.amount)), 0);
}

export function approvedCharge(quotes: QuoteLike[], fallback = 0) {
  return Number(quotes.find((quote) => quote.status === "APPROVED")?.amount ?? fallback);
}

export function repairJson(repair: RepairView) {
  const paid = paidTotal(repair.payments);
  const finalCharge = approvedCharge(repair.quotes, Number(repair.estimatedCost));
  return {
    ...repair,
    estimatedCost: Number(repair.estimatedCost),
    payments: repair.payments.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
    quotes: repair.quotes.map((quote) => ({ ...quote, amount: Number(quote.amount), approvalTokenHash: undefined })),
    paid,
    finalCharge,
    remaining: Math.max(0, finalCharge - paid),
  };
}

export function approvalBaseUrl() {
  return config.PUBLIC_TRACKING_URL.replace(/\/r\/?$/, "");
}

export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

