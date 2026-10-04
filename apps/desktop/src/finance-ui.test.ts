import { describe, expect, it } from "vitest";
import { financeKpis, formatFinanceMoney } from "./finance-ui";

describe("finance presentation", () => {
  it("renders stable LTR Egyptian currency without bidi reordering", () => expect(formatFinanceMoney(12450)).toBe("12,450.00 ج.م"));
  it("keeps every operational KPI visible", () => expect(financeKpis).toHaveLength(8));
});
