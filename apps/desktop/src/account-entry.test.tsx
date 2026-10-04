// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { login, type Session } from "./auth";

vi.mock("./auth", () => ({ login: vi.fn() }));
vi.mock("./Dashboard", () => ({ Dashboard: () => <h1>لوحة الاستقبال</h1> }));
vi.mock("./ConnectivityStatus", () => ({ ConnectivityStatus: () => null }));
vi.mock("./printer", () => ({ PrintAgent: () => null, getPrinterConfig: () => undefined }));

const session: Session = {
  success: true, token: "test-token",
  user: { id: "user", name: "مستخدم موجود", permissions: ["repair.view"], branchId: "branch" },
  tenant: { id: "tenant", name: "المركز", slug: "demo", primaryColor: "#0f766e" },
  branch: { id: "branch", name: "الرئيسي", code: "MAIN" }, permissions: ["repair.view"],
};
let container: HTMLDivElement;
let root: Root;
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label);
  expect(button, `Button ${label} should exist`).toBeDefined();
  await act(async () => { button!.click(); });
}
function expectChoice() {
  expect(container.querySelector("h1")?.textContent).toBe("هل لديك حساب؟");
  expect(Array.from(container.querySelectorAll("button")).map((item) => item.textContent)).toEqual(["لدي حساب بالفعل", "إنشاء حساب جديد"]);
  expect(container.querySelector("form")).toBeNull();
}
async function signIn() {
  await click("لدي حساب بالفعل");
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(login).toHaveBeenCalledWith({ tenant: "demo", identity: "reception@demo.local", password: "Demo@12345" });
  expect(container.querySelector("main")?.textContent).toContain("لوحة الاستقبال");
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(login).mockResolvedValue(session);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<App />); });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("account entry choice", () => {
  it("always starts with an explicit choice without logging in or creating an account", () => {
    expectChoice();
    expect(login).not.toHaveBeenCalled();
  });
  it("opens login for existing accounts and returns to the choice", async () => {
    await click("لدي حساب بالفعل");
    expect(container.querySelector('input[name="identity"]')).not.toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("أهلاً بعودتك");
    await click("رجوع إلى البداية");
    expectChoice();
  });
  it("opens new account setup and returns to the choice", async () => {
    await click("إنشاء حساب جديد");
    expect(container.querySelector("h1")?.textContent).toBe("الخطوة 1 من 7");
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    await click("رجوع إلى البداية");
    expectChoice();
    expect(login).not.toHaveBeenCalled();
  });
  it("returns existing users to the choice after signing out", async () => {
    await signIn();
    await click("تسجيل الخروج");
    expectChoice();
  });
  it("shows the choice again when the app is reopened after a previous login", async () => {
    await signIn();
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await act(async () => { root.render(<App />); });
    expectChoice();
    expect(login).toHaveBeenCalledTimes(1);
  });
});