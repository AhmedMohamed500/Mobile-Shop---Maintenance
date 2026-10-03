import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/client/index.js";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";

export function registerEventRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/events", async (request) => {
    const auth = await requireAuth(request);
    const { after } = z.object({ after: z.coerce.date().optional() }).parse(request.query);
    const events = await prisma.systemEvent.findMany({
      where: { tenantId: auth.tenantId, createdAt: { gt: after ?? new Date(Date.now() - 30_000) }, ...(auth.branchId ? { OR: [{ branchId: auth.branchId }, { branchId: null }] } : {}) },
      select: { id: true, type: true, entityId: true, branchId: true, payload: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 100,
    });
    return { events, cursor: events.length ? events[events.length - 1]!.createdAt : (after ?? new Date()) };
  });
}