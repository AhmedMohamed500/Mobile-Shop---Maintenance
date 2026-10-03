import { PrismaClient } from "../generated/client/index.js";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { permissions } from "@repair/domain";

const prisma = new PrismaClient();

async function main() {
  for (const id of permissions) await prisma.permission.upsert({ where: { id }, update: {}, create: { id, description: id } });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { name: "مركز تجريبي لصيانة الموبايلات" },
    create: { name: "مركز تجريبي لصيانة الموبايلات", slug: "demo", phone: "+201000000000", whatsapp: "+201000000000", address: "القاهرة، مصر", primaryColor: "#0f766e" },
  });
  const branch = await prisma.branch.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "MAIN" } }, update: { name: "الفرع الرئيسي", isActive: true }, create: { tenantId: tenant.id, code: "MAIN", name: "الفرع الرئيسي", address: "القاهرة" } });

  const templates: Record<string, string[]> = {
    owner: [...permissions],
    manager: permissions.filter((p) => !["role.manage", "user.manage"].includes(p)),
    receptionist: ["repair.intake.create", "repair.view", "customer.manage", "delivery.complete", "payment.create"],
    technician: ["repair.view", "repair.edit", "repair.status.change", "repair.quote.create", "repair.unlock.view", "workshop.access"],
  };
  const roles: Record<string, string> = {};
  for (const [name, rolePermissions] of Object.entries(templates)) {
    const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: tenant.id, name } }, update: { isSystem: true }, create: { tenantId: tenant.id, name, isSystem: true } });
    roles[name] = role.id;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: rolePermissions.map((permissionId) => ({ roleId: role.id, permissionId })) });
  }

  const passwordHash = await bcrypt.hash("Demo@12345", 12);
  const userIds: Record<string, string> = {};
  for (const [name, email, role] of [
    ["مالك المركز", "owner@demo.local", "owner"],
    ["موظف الاستقبال", "reception@demo.local", "receptionist"],
    ["فني الصيانة", "technician@demo.local", "technician"],
    ["مدير المركز", "manager@demo.local", "manager"],
  ] as const) {
    const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: tenant.id, email } }, update: { branchId: branch.id, name, passwordHash, isActive: true }, create: { tenantId: tenant.id, branchId: branch.id, name, email, passwordHash } });
    userIds[role] = user.id;
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: roles[role]! } }, update: {}, create: { userId: user.id, roleId: roles[role]! } });
  }

  await prisma.deviceBrand.createMany({ data: ["Apple", "Samsung", "Xiaomi", "Oppo", "Realme", "Huawei", "Nokia"].map((name, sortOrder) => ({ tenantId: tenant.id, name, sortOrder })), skipDuplicates: true });
  await prisma.faultPreset.createMany({ data: ["الشاشة", "البطارية", "الشحن", "سوكت الشحن", "الكاميرا", "السماعة", "الميكروفون", "الشبكة", "البوردة", "السوفت وير", "مشكلة مياه", "لا يعمل"].map((name, sortOrder) => ({ tenantId: tenant.id, name, sortOrder })), skipDuplicates: true });

  const samsung = await prisma.deviceBrand.findUniqueOrThrow({ where: { tenantId_name: { tenantId: tenant.id, name: "Samsung" } } });
  const demoCustomer = await prisma.customer.upsert({
    where: { tenantId_phoneNormalized: { tenantId: tenant.id, phoneNormalized: "+201001234567" } },
    update: { name: "عميل العرض التجريبي", phoneDisplay: "01001234567", whatsappPhone: "+201001234567", isRegular: true },
    create: { tenantId: tenant.id, name: "عميل العرض التجريبي", phoneNormalized: "+201001234567", phoneDisplay: "01001234567", whatsappPhone: "+201001234567", isRegular: true, notes: "بيانات عرض يمكن استخدامها لتجربة سير العمل" },
  });
  const year = new Date().getFullYear();
  const demoRepairs = [
    { repairNumber: `DEMO-${year}-READY`, model: "Galaxy A54", fault: "الشاشة لا تستجيب للمس", status: "READY_FOR_DELIVERY" as const, estimate: 900, deposit: 200, token: "demo-ready-tracking-token-2026" },
    { repairNumber: `DEMO-${year}-WORK`, model: "Galaxy S22", fault: "الجهاز يفصل أثناء الاستخدام", status: "UNDER_REPAIR" as const, estimate: 1200, deposit: 300, token: "demo-work-tracking-token-2026" },
  ];
  for (const demo of demoRepairs) {
    await prisma.repairOrder.upsert({
      where: { tenantId_repairNumber: { tenantId: tenant.id, repairNumber: demo.repairNumber } }, update: {},
      create: { tenantId: tenant.id, branchId: branch.id, customerId: demoCustomer.id, brandId: samsung.id, createdById: userIds.receptionist!, repairNumber: demo.repairNumber, publicTokenHash: createHash("sha256").update(demo.token).digest("hex"), model: demo.model, color: "أسود", reportedFault: demo.fault, estimatedCost: demo.estimate, status: demo.status, payments: { create: { amount: demo.deposit, kind: "DEPOSIT", createdById: userIds.receptionist! } }, statusHistory: { create: [{ toStatus: "RECEIVED", changedById: userIds.receptionist! }, { fromStatus: "RECEIVED", toStatus: demo.status, reason: "بيانات عرض تجريبية", changedById: userIds.technician! }] } },
    });
  }

  const plan = await prisma.plan.upsert({ where: { code: "STARTER" }, update: {}, create: { code: "STARTER", name: "Starter", monthlyPrice: 799, yearlyPrice: 7990, limits: { branches: 2, employees: 10, monthlyRepairs: 1000, whatsapp: true } } });
  if (!(await prisma.subscription.findFirst({ where: { tenantId: tenant.id } }))) await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: "TRIAL", billingCycle: "MONTHLY", startsAt: new Date(), endsAt: new Date(Date.now() + 14 * 86400000) } });
}

main().finally(() => prisma.$disconnect());
