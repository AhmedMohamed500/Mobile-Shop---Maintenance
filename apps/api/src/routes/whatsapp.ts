import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../generated/client/index.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";

function validSignature(rawBody: Buffer | undefined, signature: string | undefined) {
  if (!rawBody || !signature || !config.META_WHATSAPP_APP_SECRET) return false;
  const expected = `sha256=${createHmac("sha256", config.META_WHATSAPP_APP_SECRET).update(rawBody).digest("hex")}`;
  const left = Buffer.from(expected); const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerWhatsappWebhookRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/webhooks/whatsapp", async (request, reply) => {
    const query = z.object({ "hub.mode": z.string(), "hub.verify_token": z.string(), "hub.challenge": z.string() }).safeParse(request.query);
    if (!query.success || query.data["hub.mode"] !== "subscribe" || !config.META_WHATSAPP_VERIFY_TOKEN || query.data["hub.verify_token"] !== config.META_WHATSAPP_VERIFY_TOKEN) return reply.status(403).send("Verification failed");
    return reply.type("text/plain").send(query.data["hub.challenge"]);
  });

  app.post("/webhooks/whatsapp", { config: { rawBody: true } }, async (request, reply) => {
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!validSignature(rawBody, request.headers["x-hub-signature-256"] as string | undefined)) return reply.status(401).send({ success: false });
    const body = request.body as any; const statuses: any[] = [];
    for (const entry of body?.entry ?? []) for (const change of entry?.changes ?? []) for (const status of change?.value?.statuses ?? []) statuses.push(status);
    for (const status of statuses) {
      const message = await prisma.whatsappMessage.findFirst({ where: { providerMessageId: String(status.id) } });
      if (!message) continue;
      const eventType = String(status.status); const providerEventId = `${status.id}:${eventType}:${status.timestamp ?? ""}`;
      try { await prisma.whatsappWebhookEvent.create({ data: { tenantId: message.tenantId, providerEventId, eventType, payload: status } }); } catch (error) { if ((error as { code?: string }).code === "P2002") continue; throw error; }
      const when = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
      const failure = status.errors?.map((item: any) => item.title ?? item.message ?? item.code).join("; ");
      await prisma.whatsappMessage.update({ where: { id: message.id }, data: eventType === "sent" ? { status: "SENT", sentAt: message.sentAt ?? when } : eventType === "delivered" ? { status: "COMPLETED", deliveredAt: when } : eventType === "read" ? { status: "COMPLETED", deliveredAt: message.deliveredAt ?? when, readAt: when } : eventType === "failed" ? { status: "FAILED", failureReason: failure || "Meta delivery failed" } : {} });
    }
    return reply.send({ success: true, processed: statuses.length });
  });
}