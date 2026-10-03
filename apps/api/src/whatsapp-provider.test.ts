import { describe, expect, it } from "vitest";
import { whatsappReadiness } from "./services/adapters";
describe("WhatsApp provider readiness", () => {
  it("prevents mock sends in production", () => { expect(whatsappReadiness({ provider: "mock", accessToken: "", phoneNumberId: "", appSecret: "", verifyToken: "" }, true)).toMatchObject({ status: "NOT_CONFIGURED", canSend: false }); });
  it("reports missing Meta settings without exposing secrets", () => { const value = whatsappReadiness({ provider: "meta", accessToken: "", phoneNumberId: "", appSecret: "", verifyToken: "" }, true); expect(value.status).toBe("ERROR"); expect(value.missing).toEqual(["META_WHATSAPP_ACCESS_TOKEN", "META_WHATSAPP_PHONE_NUMBER_ID", "META_WHATSAPP_APP_SECRET", "META_WHATSAPP_VERIFY_TOKEN"]); expect(JSON.stringify(value)).not.toContain("Bearer"); });
});
