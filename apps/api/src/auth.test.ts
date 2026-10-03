import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/client/index.js";

let buildApp: typeof import("./app.js").buildApp;

beforeAll(async () => {
  ({ buildApp } = await import("./app.js"));
});

async function loginFixture(options: { tenant?: boolean; password?: string; subscriptionStatus?: string } = {}) {
  const passwordHash = await bcrypt.hash(options.password ?? "Demo@12345", 4);
  const tenant = options.tenant === false ? null : {
    id: "tenant-demo",
    slug: "demo",
    name: "مركز تجريبي لصيانة الموبايلات",
    primaryColor: "#0f766e",
    subscriptions: [{ status: options.subscriptionStatus ?? "TRIAL", startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000) }],
  };
  const user = {
    id: "user-reception",
    tenantId: "tenant-demo",
    branchId: "branch-main",
    name: "موظف الاستقبال",
    email: "reception@demo.local",
    username: "reception",
    passwordHash,
    branch: { id: "branch-main", name: "الفرع الرئيسي", code: "MAIN" },
    roles: [{ role: { permissions: [{ permissionId: "repair.view" }, { permissionId: "repair.intake.create" }] } }],
  };
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue(tenant) },
    user: { findFirst: vi.fn().mockResolvedValue(user) },
  } as unknown as PrismaClient;
  return { app: buildApp(prisma), prisma };
}

const credentials = { tenant: "demo", email: "reception@demo.local",
    username: "reception", password: "Demo@12345" };

describe("POST /auth/login", () => {
  it("logs in the seeded demo receptionist and returns JSON", async () => {
    const { app } = await loginFixture();
    const response = await app.inject({ method: "POST", url: "/auth/login", headers: { origin: "http://127.0.0.1:5173" }, payload: credentials });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(response.json()).toMatchObject({
      success: true,
      user: { name: "موظف الاستقبال", branchId: "branch-main" },
      tenant: { slug: "demo" },
      branch: { code: "MAIN" },
      permissions: ["repair.view", "repair.intake.create"],
    });
    expect(response.json().token).toEqual(expect.any(String));
  });


  it("logs in with the tenant-scoped username", async () => {
    const { app, prisma } = await loginFixture();
    const response = await app.inject({ method: "POST", url: "/auth/login", payload: { tenant: "demo", identity: "reception", password: "Demo@12345" } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ email: "reception" }, { username: "reception" }] }) }));
  });
  it("returns a JSON authentication error for a wrong password", async () => {
    const { app } = await loginFixture();
    const response = await app.inject({ method: "POST", url: "/auth/login", payload: { ...credentials, password: "Wrong@12345" } });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ success: false, code: "INVALID_CREDENTIALS", message: "بيانات تسجيل الدخول غير صحيحة" });
  });

  it("rejects an unknown repair center code before querying users", async () => {
    const { app, prisma } = await loginFixture({ tenant: false });
    const response = await app.inject({ method: "POST", url: "/auth/login", payload: { ...credentials, tenant: "missing" } });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ success: false, code: "INVALID_REPAIR_CENTER", message: "رمز مركز الصيانة غير صحيح" });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a suspended tenant with a structured JSON error", async () => {
    const { app } = await loginFixture({ subscriptionStatus: "SUSPENDED" });
    const response = await app.inject({ method: "POST", url: "/auth/login", payload: credentials });
    await app.close();
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ success: false, code: "TENANT_SUSPENDED" });
  });

  it("rejects an expired subscription with a structured JSON error", async () => {
    const { app } = await loginFixture({ subscriptionStatus: "EXPIRED" });
    const response = await app.inject({ method: "POST", url: "/auth/login", payload: credentials });
    await app.close();
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ success: false, code: "SUBSCRIPTION_EXPIRED" });
  });});
