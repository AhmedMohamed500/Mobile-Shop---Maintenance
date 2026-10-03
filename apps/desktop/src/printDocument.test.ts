import { describe, expect, it } from "vitest";
import { renderPrintDocument } from "./printDocument";

describe("print document", () => {
  it("renders Arabic, logo, selected faults and a real embedded QR without unlock secrets", async () => {
    const html = await renderPrintDocument({ kind: "RECEIPT", paperWidth: "80mm", payload: { shopName: "مركز الصيانة", logoUrl: "https://example.test/logo.png", repairNumber: "REP-1", selectedFaults: ["الشاشة", "الشحن"], fault: "سقط الجهاز", trackingUrl: "https://example.test/r/token", unlockValue: "1234", pattern: "1-2-3" } });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("الأعطال المحددة:");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("logo.png");
    expect(html).not.toContain("1234");
    expect(html).not.toContain("1-2-3");
  });
});
