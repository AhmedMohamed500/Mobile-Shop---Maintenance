export type RepairStatus = "RECEIVED" | "DIAGNOSING" | "AWAITING_CUSTOMER_APPROVAL" | "CUSTOMER_APPROVED" | "CUSTOMER_DECLINED" | "UNDER_REPAIR" | "READY_FOR_DELIVERY" | "READY_FOR_RETURN_WITHOUT_REPAIR" | "DELIVERED" | "CANCELLED";

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

export function moneyMinorToDisplay(amountMinor: number): string {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(amountMinor / 100);
}
