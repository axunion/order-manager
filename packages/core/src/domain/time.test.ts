import { describe, expect, it } from "vitest";
import { jstDayRange, now, todayJst, toJstDateString } from "./time";

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

describe("jstDayRange", () => {
  it("computes the UTC+9 offset for a mid-year date", () => {
    const { from, to } = jstDayRange("2026-07-16");
    expect(from).toBe(new Date("2026-07-15T15:00:00.000Z").getTime());
    expect(to).toBe(new Date("2026-07-16T15:00:00.000Z").getTime());
  });

  it("covers exactly 24 hours", () => {
    const { from, to } = jstDayRange("2026-07-16");
    expect(to - from).toBe(24 * 60 * 60 * 1000);
  });

  it("handles a year boundary", () => {
    const { from, to } = jstDayRange("2026-01-01");
    expect(from).toBe(new Date("2025-12-31T15:00:00.000Z").getTime());
    expect(to).toBe(new Date("2026-01-01T15:00:00.000Z").getTime());
  });

  it("handles a leap-year February edge (2028-02-29)", () => {
    const { from, to } = jstDayRange("2028-02-29");
    expect(from).toBe(new Date("2028-02-28T15:00:00.000Z").getTime());
    expect(to).toBe(new Date("2028-02-29T15:00:00.000Z").getTime());
  });

  it("throws on a malformed date string", () => {
    expect(() => jstDayRange("2026/07/16")).toThrow();
    expect(() => jstDayRange("not-a-date")).toThrow();
  });
});

describe("toJstDateString", () => {
  it("converts a UTC timestamp exactly at JST midnight", () => {
    const ms = new Date("2025-12-31T15:00:00.000Z").getTime(); // 2026-01-01T00:00 JST
    expect(toJstDateString(ms)).toBe("2026-01-01");
  });

  it("converts a UTC timestamp just before JST midnight to the prior day", () => {
    const ms = new Date("2025-12-31T14:59:59.999Z").getTime(); // 2025-12-31T23:59:59.999 JST
    expect(toJstDateString(ms)).toBe("2025-12-31");
  });

  it("round-trips with jstDayRange", () => {
    const { from } = jstDayRange("2026-03-15");
    expect(toJstDateString(from)).toBe("2026-03-15");
  });
});

describe("todayJst", () => {
  it("returns a YYYY-MM-DD string matching toJstDateString(now())", () => {
    expect(todayJst()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayJst()).toBe(toJstDateString(Date.now()));
  });
});
