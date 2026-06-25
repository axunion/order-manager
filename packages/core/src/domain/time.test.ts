import { describe, expect, it } from "vitest";
import { now } from "./time";

describe("now", () => {
  it("returns a number", () => {
    expect(typeof now()).toBe("number");
  });

  it("returns an integer (Unix milliseconds)", () => {
    expect(Number.isInteger(now())).toBe(true);
  });

  it("is within a 1-second window of Date.now()", () => {
    const before = Date.now();
    const result = now();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});
