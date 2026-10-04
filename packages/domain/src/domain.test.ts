import { describe, expect, it } from "vitest";
import { assertTransition, estimatedRemaining, normalizePhone, normalizeWhatsappPhone } from "./index";

describe("repair domain", () => {
  it("normalizes Egyptian mobile numbers", () => expect(normalizePhone("010 1234 5678")).toBe("+201012345678"));
  it("normalizes WhatsApp mobiles once and rejects duplicated country codes", () => { expect(normalizeWhatsappPhone("01012345678")).toBe("+201012345678"); expect(normalizeWhatsappPhone("00201012345678")).toBe("+201012345678"); expect(() => normalizeWhatsappPhone("+20201012345678")).toThrow("INVALID_WHATSAPP_PHONE"); });
  it("rejects deposits above estimates", () => expect(() => estimatedRemaining(1000, 1001)).toThrow());
  it("allows valid state transitions", () => expect(() => assertTransition("RECEIVED", "DIAGNOSING")).not.toThrow());
  it("rejects invalid state transitions", () => expect(() => assertTransition("RECEIVED", "DELIVERED")).toThrow());
});
