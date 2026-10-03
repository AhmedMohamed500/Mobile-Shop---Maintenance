import { describe, expect, it, vi } from "vitest";
import { createIdempotencyTracker } from "./idempotency";

describe("offline duplicate prevention", () => {
  it("reuses the same key after a failed/lost response and rotates it after success or payload change", () => {
    const createKey = vi.fn().mockReturnValueOnce("key-1").mockReturnValueOnce("key-2").mockReturnValueOnce("key-3");
    const tracker = createIdempotencyTracker(createKey);

    expect(tracker.keyFor('{"repair":"A"}')).toBe("key-1");
    expect(tracker.keyFor('{"repair":"A"}')).toBe("key-1");
    expect(tracker.keyFor('{"repair":"B"}')).toBe("key-2");
    tracker.clear();
    expect(tracker.keyFor('{"repair":"B"}')).toBe("key-3");
    expect(createKey).toHaveBeenCalledTimes(3);
  });
});