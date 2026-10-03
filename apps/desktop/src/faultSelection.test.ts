import { describe, expect, it } from "vitest";
import { selectedFaultNames, toggleFault } from "./faultSelection";
const faults = [{ id: "screen", name: "الشاشة" }, { id: "battery", name: "البطارية" }];
describe("fault preset selection", () => {
  it("selects multiple faults without duplicates and deselects", () => { let selected: string[] = []; selected = toggleFault(selected, "screen"); selected = toggleFault(selected, "battery"); expect(selected).toEqual(["screen", "battery"]); selected = toggleFault(selected, "screen"); expect(selected).toEqual(["battery"]); });
  it("keeps the manual description separate from visible preset names", () => { const manual = "وصف العميل الحر"; expect(selectedFaultNames(["battery"], faults)).toEqual(["البطارية"]); expect(manual).toBe("وصف العميل الحر"); });
});
