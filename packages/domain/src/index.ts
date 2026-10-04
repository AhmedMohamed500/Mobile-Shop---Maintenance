export const repairStatuses = [
  "RECEIVED",
  "DIAGNOSING",
  "AWAITING_CUSTOMER_APPROVAL",
  "CUSTOMER_APPROVED",
  "CUSTOMER_DECLINED",
  "UNDER_REPAIR",
  "READY_FOR_DELIVERY",
  "READY_FOR_RETURN_WITHOUT_REPAIR",
  "DELIVERED",
  "CANCELLED",
] as const;

export type RepairStatus = (typeof repairStatuses)[number];

export const statusLabels: Record<RepairStatus, string> = {
  RECEIVED: "تم الاستلام",
  DIAGNOSING: "قيد الفحص",
  AWAITING_CUSTOMER_APPROVAL: "في انتظار موافقة العميل",
  CUSTOMER_APPROVED: "وافق العميل",
  CUSTOMER_DECLINED: "رفض العميل",
  UNDER_REPAIR: "تحت الصيانة",
  READY_FOR_DELIVERY: "جاهز للتسليم",
  READY_FOR_RETURN_WITHOUT_REPAIR: "جاهز للاستلام بدون صيانة",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

const transitions: Record<RepairStatus, readonly RepairStatus[]> = {
  RECEIVED: ["DIAGNOSING", "CANCELLED"],
  DIAGNOSING: ["AWAITING_CUSTOMER_APPROVAL", "READY_FOR_DELIVERY", "CANCELLED"],
  AWAITING_CUSTOMER_APPROVAL: ["CUSTOMER_APPROVED", "CUSTOMER_DECLINED", "CANCELLED"],
  CUSTOMER_APPROVED: ["UNDER_REPAIR", "CANCELLED"],
  CUSTOMER_DECLINED: ["READY_FOR_RETURN_WITHOUT_REPAIR"],
  UNDER_REPAIR: ["READY_FOR_DELIVERY", "DIAGNOSING"],
  READY_FOR_DELIVERY: ["DELIVERED", "UNDER_REPAIR"],
  READY_FOR_RETURN_WITHOUT_REPAIR: ["DELIVERED", "DIAGNOSING"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: RepairStatus, to: RepairStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: RepairStatus, to: RepairStatus): void {
  if (!canTransition(from, to)) throw new Error(`INVALID_TRANSITION:${from}:${to}`);
}

export function normalizePhone(input: string, defaultCountry = "EG"): string {
  let digits = input.replace(/\D/g, "");
  if (defaultCountry === "EG") {
    if (digits.startsWith("0020")) digits = digits.slice(2);
    if (digits.startsWith("0") && digits.length === 11) digits = `20${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith("1")) digits = `20${digits}`;
  }
  if (!/^\d{10,15}$/.test(digits)) throw new Error("INVALID_PHONE");
  return `+${digits}`;
}

export function normalizeWhatsappPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (/^01[0125]\d{8}$/.test(digits)) digits = `20${digits.slice(1)}`;
  else if (/^1[0125]\d{8}$/.test(digits)) digits = `20${digits}`;
  if (!/^20(10|11|12|15)\d{8}$/.test(digits)) throw new Error("INVALID_WHATSAPP_PHONE");
  return `+${digits}`;
}
export function moneyMinorToDisplay(amountMinor: number): string {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(amountMinor / 100);
}

export function estimatedRemaining(costMinor: number, depositMinor: number): number {
  if (!Number.isInteger(costMinor) || !Number.isInteger(depositMinor) || costMinor < 0 || depositMinor < 0) {
    throw new Error("INVALID_MONEY");
  }
  if (depositMinor > costMinor) throw new Error("DEPOSIT_EXCEEDS_ESTIMATE");
  return costMinor - depositMinor;
}

export const permissions = [
  "repair.intake.create", "repair.view", "repair.edit", "repair.status.change", "repair.status.correct",
  "repair.quote.create", "repair.quote.approve_override", "repair.unlock.view", "repair.unlock.edit",
  "customer.manage", "workshop.access", "delivery.complete", "payment.create", "payment.refund",
  "report.financial.view", "settings.manage", "brand.manage", "fault.manage", "user.manage",
  "role.manage", "printer.manage", "whatsapp.manage", "audit.view", "cash.manage", "cash.approve", "expense.manage",
] as const;

export type Permission = (typeof permissions)[number];
