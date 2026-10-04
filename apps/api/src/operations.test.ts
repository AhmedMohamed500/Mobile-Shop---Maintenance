import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/client/index.js";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { issueToken } from "./lib/auth.js";

const tenantId = "22222222-2222-4222-8222-222222222222";
const branchId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const printJobId = "77777777-7777-4777-8777-777777777777";

describe("desktop operations", () => {
  it("scopes durable real-time events to the authenticated tenant and branch", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const app = buildApp({ systemEvent: { findMany } } as unknown as PrismaClient);
    const token = await issueToken({ userId, tenantId, branchId, permissions: [] });
    const response = await app.inject({ method: "GET", url: "/events?after=2026-10-03T10:00:00.000Z", headers: { authorization: `Bearer ${token}` } });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, OR: [{ branchId }, { branchId: null }] }),
      take: 100,
    }));
  });

  it("fetches a branch print queue and records a successful physical print", async () => {
    const queued = [{ id: printJobId, repairOrderId: "11111111-1111-4111-8111-111111111111", kind: "RECEIPT", payload: {}, status: "QUEUED", attempts: 0, createdAt: new Date() }];
    const findMany = vi.fn().mockResolvedValue(queued);
    const update = vi.fn().mockResolvedValue({ ...queued[0], status: "COMPLETED", attempts: 1, printerName: "Thermal-80", workstationId: "reception-1", printedAt: new Date() });
    const auditCreate = vi.fn();
    const prisma = {
      printJob: { findMany, findFirst: vi.fn().mockResolvedValue(queued[0]), update },
      auditLog: { create: auditCreate },
    } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const token = await issueToken({ userId, tenantId, branchId, permissions: ["repair.view"] });

    const pending = await app.inject({ method: "GET", url: "/print-jobs/pending", headers: { authorization: `Bearer ${token}` } });
    const completed = await app.inject({ method: "POST", url: `/print-jobs/${printJobId}/result`, headers: { authorization: `Bearer ${token}` }, payload: { status: "COMPLETED", printerName: "Thermal-80", workstationId: "reception-1" } });
    await app.close();

    expect(pending.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "QUEUED", repairOrder: { tenantId, branchId } } }));
    expect(completed.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED", printerName: "Thermal-80", workstationId: "reception-1", attempts: { increment: 1 }, printedAt: expect.any(Date) }) }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "print.completed", tenantId }) }));
  });
});

describe("Meta WhatsApp webhook", () => {
  it("validates signatures, records delivery/read once, and ignores duplicate events", async () => {
    config.META_WHATSAPP_APP_SECRET = "test-meta-secret";
    const seen = new Set<string>();
    const eventCreate = vi.fn(async ({ data }: { data: { providerEventId: string } }) => {
      if (seen.has(data.providerEventId)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
      seen.add(data.providerEventId);
      return data;
    });
    const update = vi.fn().mockResolvedValue({});
    const message = { id: "message-1", tenantId, sentAt: new Date("2026-10-03T09:00:00Z"), deliveredAt: null };
    const prisma = {
      whatsappMessage: { findFirst: vi.fn().mockResolvedValue(message), update },
      whatsappWebhookEvent: { create: eventCreate },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;
    const app = buildApp(prisma);
    const body = { entry: [{ changes: [{ value: { statuses: [
      { id: "wamid.test", status: "delivered", timestamp: "1791018000" },
      { id: "wamid.test", status: "read", timestamp: "1791018060" },
    ] } }] }] };
    const raw = JSON.stringify(body);
    const signature = `sha256=${createHmac("sha256", config.META_WHATSAPP_APP_SECRET).update(Buffer.from(raw)).digest("hex")}`;
    const request = { method: "POST" as const, url: "/webhooks/whatsapp", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, payload: Buffer.from(raw) };

    const first = await app.inject(request);
    const duplicate = await app.inject(request);
    await app.close();

    expect(first.statusCode).toBe(200);
    expect(duplicate.statusCode).toBe(200);
    expect(first.json()).toEqual({ success: true, processed: 2 });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]![0].data).toMatchObject({ status: "COMPLETED", deliveredAt: expect.any(Date) });
    expect(update.mock.calls[1]![0].data).toMatchObject({ status: "COMPLETED", readAt: expect.any(Date) });
  });

  it("rejects a webhook with an invalid signature", async () => {
    config.META_WHATSAPP_APP_SECRET = "test-meta-secret";
    const app = buildApp({} as PrismaClient);
    const response = await app.inject({ method: "POST", url: "/webhooks/whatsapp", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=bad" }, payload: "{}" });
    await app.close();
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ success: false });
  });
});