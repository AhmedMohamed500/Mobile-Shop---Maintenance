import { api, malformedResponseError } from "./api";

export type Session = {
  success: true;
  token: string;
  user: { id: string; name: string; permissions: string[]; branchId: string | null };
  tenant: { id: string; name: string; slug: string; primaryColor: string };
  branch: { id: string; name: string; code: string } | null;
  permissions: string[];
};

export type LoginCredentials = { tenant: string; email: string; password: string };

export async function login(credentials: LoginCredentials): Promise<Session> {
  const session = await api<Session>("/auth/login", { method: "POST", body: JSON.stringify(credentials) });
  if (!session || session.success !== true || typeof session.token !== "string" || !session.user || !session.tenant) {
    throw malformedResponseError(200);
  }
  return session;
}