import { describe, expect, it } from "vitest";
import { workshopColumns } from "./Workshop";

describe("workshop layout states", () => {
  it("renders every operational state including delivered in a compact board", () => { expect(workshopColumns).toEqual(["RECEIVED", "DIAGNOSING", "AWAITING_CUSTOMER_APPROVAL", "CUSTOMER_APPROVED", "CUSTOMER_DECLINED", "UNDER_REPAIR", "READY_FOR_DELIVERY", "READY_FOR_RETURN_WITHOUT_REPAIR", "DELIVERED"]); expect(new Set(workshopColumns).size).toBe(workshopColumns.length); });
});
