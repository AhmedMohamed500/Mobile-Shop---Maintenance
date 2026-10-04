import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AndroidPattern } from "./AndroidPattern";
import { addPatternPoint, midpointBetween, serializePattern, type PatternPoint } from "./pattern";

describe("Android phone pattern", () => {
  it("selects multiple nodes, inserts Android midpoints, and never duplicates points", () => { let value: PatternPoint[] = []; value = addPatternPoint(value, 1); value = addPatternPoint(value, 3); value = addPatternPoint(value, 3); value = addPatternPoint(value, 9); expect(value).toEqual([1, 2, 3, 6, 9]); expect(midpointBetween(1, 9)).toBe(5); });
  it("serializes the internal point IDs for encrypted persistence and resets to an empty value", () => { expect(serializePattern([1, 5, 9])).toBe("1-5-9"); expect(serializePattern([])).toBe(""); });
  it("renders nine clean dots, SVG connection support and reset without visible point numbers", () => { const html = renderToStaticMarkup(<AndroidPattern value={[1, 2, 3]} onChange={() => undefined} />); expect((html.match(/pattern-dot/g) ?? []).length).toBe(9); expect(html).toContain("polyline"); expect(html).toContain("مسح النمط"); expect(html).not.toMatch(/>\s*[1-9]\s*</); });
});
