import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

export interface AuthContext { userId: string; tenantId: string; branchId: string | null; permissions: string[] }
const secret = new TextEncoder().encode(config.JWT_SECRET);

export async function issueToken(auth: AuthContext): Promise<string> {
  return new SignJWT({ tenantId: auth.tenantId, branchId: auth.branchId, permissions: auth.permissions })
    .setProtectedHeader({ alg: "HS256" }).setSubject(auth.userId).setIssuedAt().setExpirationTime("8h").sign(secret);
}

export async function requireAuth(request: FastifyRequest): Promise<AuthContext> {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) throw Object.assign(new Error("UNAUTHENTICATED"), { statusCode: 401 });
  try {
    const { payload } = await jwtVerify(value.slice(7), secret);
    return { userId: payload.sub!, tenantId: String(payload.tenantId), branchId: payload.branchId ? String(payload.branchId) : null, permissions: (payload.permissions as string[]) ?? [] };
  } catch {
    throw Object.assign(new Error("UNAUTHENTICATED"), { statusCode: 401 });
  }
}

export function requirePermission(auth: AuthContext, permission: string): void {
  if (!auth.permissions.includes(permission)) throw Object.assign(new Error("FORBIDDEN"), { statusCode: 403 });
}
