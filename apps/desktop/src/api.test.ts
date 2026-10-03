import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiClientError } from "./api";
import { login } from "./auth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop API client", () => {
  it("calls the canonical API login URL and accepts a valid JSON session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      token: "token",
      user: { id: "user", name: "موظف الاستقبال", permissions: [], branchId: "branch" },
      tenant: { id: "tenant", name: "المركز التجريبي", slug: "demo", primaryColor: "#0f766e" },
      branch: { id: "branch", name: "الفرع الرئيسي", code: "MAIN" },
      permissions: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(login({ tenant: "demo", identity: "reception@demo.local", password: "Demo@12345" })).resolves.toMatchObject({ success: true, token: "token" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST" }));
  });

  it("shows a friendly Arabic error instead of parsing a non-JSON page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("The page could not be found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })));

    const request = api("/auth/login", { method: "POST", body: "{}" });
    await expect(request).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
      message: "تعذر الاتصال بخادم النظام. تأكد من تشغيل الخادم وإعدادات الاتصال.",
    } satisfies Partial<ApiClientError>);
  });

  it("maps structured authentication failures to their Arabic message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      code: "INVALID_REPAIR_CENTER",
      message: "رمز مركز الصيانة غير صحيح",
    }), { status: 404, headers: { "content-type": "application/json" } })));

    await expect(api("/auth/login")).rejects.toMatchObject({ code: "INVALID_REPAIR_CENTER", message: "رمز مركز الصيانة غير صحيح" });
  });
});
