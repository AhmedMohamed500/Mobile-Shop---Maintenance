const configuredBase = import.meta.env.VITE_API_URL?.trim();
export const apiBaseUrl = (configuredBase || "/api").replace(/\/$/, "");

export type ApiErrorCode =
  | "INVALID_CREDENTIALS"
  | "INVALID_REPAIR_CENTER"
  | "TENANT_SUSPENDED"
  | "SUBSCRIPTION_EXPIRED"
  | "VALIDATION_ERROR"
  | "API_UNAVAILABLE"
  | "SERVER_ERROR"
  | "MALFORMED_RESPONSE"
  | "REQUEST_FAILED";

const messages: Record<ApiErrorCode, string> = {
  INVALID_CREDENTIALS: "بيانات تسجيل الدخول غير صحيحة",
  INVALID_REPAIR_CENTER: "رمز مركز الصيانة غير صحيح",
  TENANT_SUSPENDED: "تم إيقاف حساب مركز الصيانة. تواصل مع الدعم.",
  SUBSCRIPTION_EXPIRED: "انتهى اشتراك مركز الصيانة. يرجى تجديد الاشتراك.",
  VALIDATION_ERROR: "بيانات تسجيل الدخول غير مكتملة أو غير صحيحة",
  API_UNAVAILABLE: "تعذر الاتصال بخادم النظام. تأكد من تشغيل الخادم وإعدادات الاتصال.",
  SERVER_ERROR: "حدث خطأ في خادم النظام. حاول مرة أخرى لاحقًا.",
  MALFORMED_RESPONSE: "تعذر الاتصال بخادم النظام. تأكد من تشغيل الخادم وإعدادات الاتصال.",
  REQUEST_FAILED: "تعذر إتمام الطلب",
};

export class ApiClientError extends Error {
  constructor(public readonly code: ApiErrorCode, public readonly status?: number, message = messages[code]) {
    super(message);
    this.name = "ApiClientError";
  }
}

function developmentLog(message: string, details: unknown) {
  if (import.meta.env.DEV) console.error(`[API] ${message}`, details);
}

function errorCode(value: unknown, status: number): ApiErrorCode {
  const known = typeof value === "string" && value in messages ? value as ApiErrorCode : undefined;
  if (known) return known;
  return status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED";
}

export function malformedResponseError(status?: number) {
  return new ApiClientError("MALFORMED_RESPONSE", status);
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${apiBaseUrl}${normalizedPath}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (cause) {
    developmentLog("Network request failed", { url, cause });
    throw new ApiClientError("API_UNAVAILABLE");
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const rawBody = await response.text();
  if (!contentType.includes("application/json")) {
    developmentLog("Expected JSON response", {
      url,
      status: response.status,
      contentType,
      bodyPreview: rawBody.slice(0, 160),
    });
    throw malformedResponseError(response.status);
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch (cause) {
    developmentLog("Malformed JSON response", { url, status: response.status, cause });
    throw malformedResponseError(response.status);
  }

  if (!response.ok) {
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const code = errorCode(payload.code, response.status);
    const serverMessage = typeof payload.message === "string" ? payload.message : typeof payload.error === "string" ? payload.error : undefined;
    const message = code === "REQUEST_FAILED" && serverMessage ? serverMessage : messages[code];
    throw new ApiClientError(code, response.status, message);
  }

  return body as T;
}
export async function downloadCsv(path: string, token: string): Promise<Blob> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${apiBaseUrl}${normalizedPath}`;
  let response: Response;
  try { response = await fetch(url, { headers: { authorization: `Bearer ${token}` } }); }
  catch (cause) { developmentLog("Export request failed", { url, cause }); throw new ApiClientError("API_UNAVAILABLE"); }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!response.ok) {
    const body = contentType.includes("application/json") ? await response.json().catch(() => null) as Record<string, unknown> | null : null;
    throw new ApiClientError(response.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED", response.status, typeof body?.message === "string" ? body.message : undefined);
  }
  if (!contentType.includes("text/csv")) { developmentLog("Expected CSV response", { url, status: response.status, contentType }); throw malformedResponseError(response.status); }
  return response.blob();
}
