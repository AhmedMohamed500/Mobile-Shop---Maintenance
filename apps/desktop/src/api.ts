const base = import.meta.env.VITE_API_URL ?? "";

export type Session = { token: string; user: { name: string; permissions: string[]; branchId: string | null }; tenant: { name: string; primaryColor: string } };

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...options, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "تعذر إتمام الطلب");
  return body as T;
}
