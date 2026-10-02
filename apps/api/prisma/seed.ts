import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { permissions } from "@repair/domain";

const prisma = new PrismaClient();

async function main() {
  for (const id of permissions) await prisma.permission.upsert({ where: { id }, update: {}, create: { id, description: id } });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "مركز تجريبي لصيانة الموبايلات", slug: "demo", phone: "+201000000000", whatsapp: "+201000000000", address: "القاهرة، مصر", primaryColor: "#0f766e" },
  });
  const branch = await prisma.branch.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "MAIN" } }, update: {}, create: { tenantId: tenant.id, code: "MAIN", name: "الفرع الرئيسي", address: "القاهرة" } });

  const templates: Record<string, string[]> = {
    owner: [...permissions],
    manager: permissions.filter((p) => !["role.manage", "user.manage"].includes(p)),
    receptionist: ["repair.intake.create", "repair.view", "customer.manage", "delivery.complete", "payment.create"],
    technician: ["repair.view", "repair.edit", "repair.status.change", "repair.quote.create", "repair.unlock.view", "workshop.access"],
  };
  const roles: Record<string, string> = {};
  for (const [name, rolePermissions] of Object.entries(templates)) {
    const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: tenant.id, name } }, update: {}, create: { tenantId: tenant.id, name, isSystem: true } });
    roles[name] = role.id;
    await prisma.rolePermission.createMany({ data: rolePermissions.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
  }

  const passwordHash = await bcrypt.hash("Demo@12345", 12);
  for (const [name, email, role] of [
    ["مالك المركز", "owner@demo.local", "owner"],
    ["موظف الاستقبال", "reception@demo.local", "receptionist"],
    ["فني الصيانة", "technician@demo.local", "technician"],
    ["مدير المركز", "manager@demo.local", "manager"],
  ] as const) {
    const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: tenant.id, email } }, update: {}, create: { tenantId: tenant.id, branchId: branch.id, name, email, passwordHash } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: roles[role]! } }, update: {}, create: { userId: user.id, roleId: roles[role]! } });
  }

  await prisma.deviceBrand.createMany({ data: ["Apple", "Samsung", "Xiaomi", "Oppo", "Realme", "Huawei", "Nokia"].map((name, sortOrder) => ({ tenantId: tenant.id, name, sortOrder })), skipDuplicates: true });
  await prisma.faultPreset.createMany({ data: ["الشاشة", "البطارية", "الشحن", "سوكت الشحن", "الكاميرا", "السماعة", "الميكروفون", "الشبكة", "البوردة", "السوفت وير", "مشكلة مياه", "لا يعمل"].map((name, sortOrder) => ({ tenantId: tenant.id, name, sortOrder })), skipDuplicates: true });
  const plan = await prisma.plan.upsert({ where: { code: "STARTER" }, update: {}, create: { code: "STARTER", name: "Starter", monthlyPrice: 799, yearlyPrice: 7990, limits: { branches: 2, employees: 10, monthlyRepairs: 1000, whatsapp: true } } });
  if (!(await prisma.subscription.findFirst({ where: { tenantId: tenant.id } }))) await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: "TRIAL", billingCycle: "MONTHLY", startsAt: new Date(), endsAt: new Date(Date.now() + 14 * 86400000) } });
}

main().finally(() => prisma.$disconnect());
