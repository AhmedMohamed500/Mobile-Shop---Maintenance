import { describe, expect, it } from "vitest";
import { normalizePhone } from "@repair/domain";
import { createPublicToken, hashToken } from "./lib/crypto.js";

describe("API security primitives", () => {
  it("creates non-sequential tracking tokens stored as hashes", () => {
    const token = createPublicToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashToken(token)).not.toContain(token);
  });
  it("produces one identity for alternate Egyptian phone formats", () => {
    expect(normalizePhone("01012345678")).toBe(normalizePhone("+20 101 234 5678"));
  });
});
