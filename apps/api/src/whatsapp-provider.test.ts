import { describe, expect, it } from "vitest";
import { whatsappReadiness } from "./services/adapters";
describe("WhatsApp provider readiness", () => {
  it("prevents mock sends in production", () => { expect(whatsappReadiness({ provider: "mock", accessToken: "", phoneNumberId: "", appSecret: "", verifyToken: "" }, true)).toMatchObject({ status: "NOT_CONFIGURED", canSend: false }); });
  it("reports missing Meta settings without exposing secrets", () => { const value = whatsappReadiness({ provider: "meta", accessToken: "", phoneNumberId: "", appSecret: "", verifyToken: "" }, true); expect(value.status).toBe("ERROR"); expect(value.missing).toEqual(["access token", "phone number id", "app secret", "verify token"]); expect(JSON.stringify(value)).not.toContain("Bearer"); });
});
