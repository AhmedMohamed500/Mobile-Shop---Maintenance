import type { RepairStatus } from "@repair/domain";

export type Page = "dashboard" | "intake" | "workshop" | "delivery" | "customers" | "settings" | "users";
export type CatalogItem = { id: string; name: string; isActive?: boolean; sortOrder?: number };
export type Catalog = { brands: CatalogItem[]; faults: CatalogItem[]; branches: CatalogItem[] };
export type Customer = { id: string; name: string; phoneDisplay: string; phoneNormalized: string; whatsappPhone?: string; isRegular: boolean; notes?: string; repairs?: Pick<Repair, "id" | "repairNumber" | "status" | "model" | "createdAt">[] };
export type Quote = { id: string; version: number; amount: number; diagnosis: string; customerNote?: string; status: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED"; createdAt: string; decidedAt?: string };
export type Repair = {
  id: string; repairNumber: string; status: RepairStatus; model: string; color?: string; imei?: string; reportedFault: string; estimatedCost: number; paid: number; finalCharge: number; remaining: number; createdAt: string; updatedAt: string;
  customer: Customer; brand: CatalogItem; branch: CatalogItem;
  faults: { faultPreset: CatalogItem }[];
  quotes: Quote[];
  notes: { id: string; type: "DIAGNOSTIC" | "INTERNAL"; body: string; createdAt: string; author: { name: string } }[];
  assignments: { id: string; endedAt?: string; technician: { id: string; name: string } }[];
  statusHistory: { id: string; fromStatus?: RepairStatus; toStatus: RepairStatus; reason?: string; createdAt: string }[];
  printJobs: { id: string; kind: string; status: string; createdAt: string }[];
};

export const formatMoney = (value: number) => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(value);

