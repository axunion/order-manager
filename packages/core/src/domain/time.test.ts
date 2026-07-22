import { describe, expect, it } from "vitest";
import {
  jstDayRange,
  jstMonthRange,
  jstWeekRange,
  now,
  todayJst,
  toJstDateString,
  toJstHour,
  toJstWeekday,
} from "./time";

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

  it("throws on a calendar-invalid date instead of silently rolling over", () => {
    expect(() => jstDayRange("2024-02-30")).toThrow();
    expect(() => jstDayRange("2026-13-01")).toThrow();
    expect(() => jstDayRange("2026-01-32")).toThrow();
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

describe("jstWeekRange", () => {
  it("starts on Monday and ends the following Monday, for a mid-week date", () => {
    // 2026-07-16 is a Thursday.
    const { from, to } = jstWeekRange("2026-07-16");
    expect(from).toEqual(jstDayRange("2026-07-13").from); // Monday
    expect(to).toEqual(jstDayRange("2026-07-20").from); // next Monday
  });

  it("is a no-op shift when the date is already a Monday", () => {
    const { from, to } = jstWeekRange("2026-07-13");
    expect(from).toEqual(jstDayRange("2026-07-13").from);
    expect(to).toEqual(jstDayRange("2026-07-20").from);
  });

  it("treats Sunday as the last day of its week, not the first", () => {
    // 2026-07-19 is a Sunday, part of the week starting 2026-07-13.
    const { from, to } = jstWeekRange("2026-07-19");
    expect(from).toEqual(jstDayRange("2026-07-13").from);
    expect(to).toEqual(jstDayRange("2026-07-20").from);
  });

  it("handles a week spanning a month boundary", () => {
    // 2026-08-01 is a Saturday, part of the week starting 2026-07-27.
    const { from, to } = jstWeekRange("2026-08-01");
    expect(from).toEqual(jstDayRange("2026-07-27").from);
    expect(to).toEqual(jstDayRange("2026-08-03").from);
  });

  it("covers exactly 7 days", () => {
    const { from, to } = jstWeekRange("2026-07-16");
    expect(to - from).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("jstMonthRange", () => {
  it("spans the first through last day of the given date's month", () => {
    const { from, to } = jstMonthRange("2026-07-16");
    expect(from).toEqual(jstDayRange("2026-07-01").from);
    expect(to).toEqual(jstDayRange("2026-08-01").from);
  });

  it("handles a December-to-January year rollover", () => {
    const { from, to } = jstMonthRange("2026-12-25");
    expect(from).toEqual(jstDayRange("2026-12-01").from);
    expect(to).toEqual(jstDayRange("2027-01-01").from);
  });

  it("handles February in a leap year", () => {
    const { from, to } = jstMonthRange("2028-02-10");
    expect(from).toEqual(jstDayRange("2028-02-01").from);
    expect(to).toEqual(jstDayRange("2028-03-01").from);
  });
});

describe("toJstWeekday", () => {
  it("returns 4 (Thursday) for a known Thursday at JST noon", () => {
    // 2026-07-16 is a Thursday; noon JST = 03:00 UTC.
    const ms = new Date("2026-07-16T03:00:00.000Z").getTime();
    expect(toJstWeekday(ms)).toBe(4);
  });

  it("returns 0 (Sunday) just after JST midnight, even though it's still Saturday UTC", () => {
    // 2026-07-19T00:00:00 JST = 2026-07-18T15:00:00 UTC (a Saturday in UTC).
    const ms = new Date("2026-07-18T15:00:00.000Z").getTime();
    expect(toJstWeekday(ms)).toBe(0);
  });
});

describe("toJstHour", () => {
  it("returns 0 exactly at JST midnight", () => {
    const { from } = jstDayRange("2026-07-16");
    expect(toJstHour(from)).toBe(0);
  });

  it("returns 23 just before the next JST midnight", () => {
    const { to } = jstDayRange("2026-07-16");
    expect(toJstHour(to - 1)).toBe(23);
  });

  it("rolls over to the next JST day's hour just before UTC midnight", () => {
    // 23:00 UTC = 08:00 JST the next day.
    const ms = new Date("2026-07-16T23:00:00.000Z").getTime();
    expect(toJstHour(ms)).toBe(8);
  });
});

describe("todayJst", () => {
  it("returns a YYYY-MM-DD string matching toJstDateString(now())", () => {
    expect(todayJst()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayJst()).toBe(toJstDateString(Date.now()));
  });
});
