import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/client/index.js";
import { buildApp } from "./app.js";
import { issueToken } from "./lib/auth.js";

const tenantId = "22222222-2222-4222-8222-222222222222";
const branchId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";

describe("tenant data exports", () => {
  it("returns UTF-8 CSV and scopes repairs to the authenticated tenant and branch", async () => {
    const findMany = vi.fn().mockResolvedValue([{ repairNumber: "REP-1", branch: { code: "MAIN" }, customer: { name: "أحمد", phoneDisplay: "01000000000" }, brand: { name: "Samsung" }, model: "A54", imei: null, reportedFault: "شاشة", faults: [{ faultPreset: { name: "الشاشة" } }], estimatedCost: 500, status: "RECEIVED", createdAt: new Date("2026-10-03T00:00:00Z"), deliveredAt: null }]);
    const app = buildApp({ repairOrder: { findMany } } as unknown as PrismaClient);
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["settings.manage"] });
    const response = await app.inject({ method: "GET", url: "/exports/repairs.csv", headers: { authorization: `Bearer ${token}` } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("repairs.csv");
    expect(response.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(response.body).toContain("أحمد");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId, branchId } }));
  });

  it("scopes financial exports through each repair and rejects missing permission", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const app = buildApp({ payment: { findMany } } as unknown as PrismaClient);
    const allowed = await issueToken({ userId, tenantId, branchId, permissions: ["report.financial.view"] });
    const denied = await issueToken({ userId, tenantId, branchId, permissions: [] });
    const success = await app.inject({ method: "GET", url: "/exports/payments.csv", headers: { authorization: `Bearer ${allowed}` } });
    const forbidden = await app.inject({ method: "GET", url: "/exports/payments.csv", headers: { authorization: `Bearer ${denied}` } });
    await app.close();
    expect(success.statusCode).toBe(200);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.headers["content-type"]).toContain("application/json");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { repairOrder: { tenantId, branchId } } }));
  });
});
