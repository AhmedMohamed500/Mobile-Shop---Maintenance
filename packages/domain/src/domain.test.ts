import { describe, expect, it } from "vitest";
import { assertTransition, estimatedRemaining, normalizePhone } from "./index";

describe("repair domain", () => {
  it("normalizes Egyptian mobile numbers", () => expect(normalizePhone("010 1234 5678")).toBe("+201012345678"));
  it("rejects deposits above estimates", () => expect(() => estimatedRemaining(1000, 1001)).toThrow());
  it("allows valid state transitions", () => expect(() => assertTransition("RECEIVED", "DIAGNOSING")).not.toThrow());
  it("rejects invalid state transitions", () => expect(() => assertTransition("RECEIVED", "DELIVERED")).toThrow());
});
