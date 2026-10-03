import type { FastifyInstance, FastifyReply } from "fastify";
import type { PrismaClient } from "../../generated/client/index.js";
import { requireAuth, requirePermission } from "../lib/auth.js";

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
function csv(headers: string[], rows: unknown[][]) { return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`; }
function sendCsv(reply: FastifyReply, name: string, headers: string[], rows: unknown[][]) { return reply.type("text/csv; charset=utf-8").header("content-disposition", `attachment; filename="${name}"`).header("cache-control", "no-store").send(csv(headers, rows)); }

export function registerExportRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/exports/customers.csv", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "settings.manage");
    const rows = await prisma.customer.findMany({ where: { tenantId: auth.tenantId, ...(auth.branchId ? { repairs: { some: { branchId: auth.branchId } } } : {}) }, orderBy: { createdAt: "asc" } });
    return sendCsv(reply, "customers.csv", ["id", "name", "phone", "whatsapp", "regular", "notes", "created_at"], rows.map((x) => [x.id, x.name, x.phoneDisplay, x.whatsappPhone, x.isRegular, x.notes, x.createdAt]));
  });
  app.get("/exports/repairs.csv", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "settings.manage");
    const rows = await prisma.repairOrder.findMany({ where: { tenantId: auth.tenantId, ...(auth.branchId ? { branchId: auth.branchId } : {}) }, include: { branch: { select: { code: true } }, customer: { select: { name: true, phoneDisplay: true } }, brand: { select: { name: true } }, faults: { include: { faultPreset: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } });
    return sendCsv(reply, "repairs.csv", ["repair_number", "branch", "customer", "phone", "brand", "model", "imei", "reported_fault", "selected_faults", "estimated_cost", "status", "created_at", "delivered_at"], rows.map((x) => [x.repairNumber, x.branch.code, x.customer.name, x.customer.phoneDisplay, x.brand.name, x.model, x.imei, x.reportedFault, x.faults.map((f) => f.faultPreset.name).join(" | "), x.estimatedCost, x.status, x.createdAt, x.deliveredAt]));
  });
  app.get("/exports/payments.csv", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "report.financial.view");
    const rows = await prisma.payment.findMany({ where: { repairOrder: { tenantId: auth.tenantId, ...(auth.branchId ? { branchId: auth.branchId } : {}) } }, include: { repairOrder: { select: { repairNumber: true, branch: { select: { code: true } } } }, createdBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
    return sendCsv(reply, "payments.csv", ["id", "repair_number", "branch", "amount", "kind", "method", "reference", "created_by", "created_at"], rows.map((x) => [x.id, x.repairOrder.repairNumber, x.repairOrder.branch.code, x.amount, x.kind, x.paymentMethod, x.reference, x.createdBy?.name, x.createdAt]));
  });
  app.get("/exports/expenses.csv", async (request, reply) => {
    const auth = await requireAuth(request); requirePermission(auth, "report.financial.view");
    const rows = await prisma.expense.findMany({ where: { tenantId: auth.tenantId, ...(auth.branchId ? { branchId: auth.branchId } : {}) }, include: { branch: { select: { code: true } }, category: { select: { name: true } }, createdBy: { select: { name: true } } }, orderBy: { incurredAt: "asc" } });
    return sendCsv(reply, "expenses.csv", ["id", "branch", "category", "amount", "method", "description", "incurred_at", "created_by", "created_at"], rows.map((x) => [x.id, x.branch.code, x.category.name, x.amount, x.paymentMethod, x.description, x.incurredAt, x.createdBy.name, x.createdAt]));
  });
}
