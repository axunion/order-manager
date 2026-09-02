import { describe, expect, it } from "vitest";
import { formatMinutes, formatWorkDate, weekdayOf } from "./format";

describe("formatMinutes", () => {
  it("renders a time of day", () => {
    expect(formatMinutes(540)).toBe("09:00");
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(1439)).toBe("23:59");
  });

  it("keeps an overnight end past midnight, rather than wrapping it", () => {
    // 1500 is 01:00 the next calendar day. Showing "01:00" would read as
    // "this shift ends in the morning of the same date", which is the one
    // thing a reader must not conclude.
    expect(formatMinutes(1500)).toBe("25:00");
    expect(formatMinutes(1440)).toBe("24:00");
  });
});

describe("formatWorkDate", () => {
  it("renders month, day and the Japanese weekday", () => {
    expect(formatWorkDate("2026-09-01")).toBe("9/1(火)");
    expect(formatWorkDate("2026-09-06")).toBe("9/6(日)");
    expect(formatWorkDate("2026-12-25")).toBe("12/25(金)");
  });

  it("drops the leading zeros a date string carries", () => {
    expect(formatWorkDate("2026-01-05")).toBe("1/5(月)");
  });
});

describe("weekdayOf", () => {
  it("numbers the weekdays from Sunday, so a copy lands on the same day name", () => {
    // 2026-08-25 and 2026-09-01 are both Tuesdays — the pairing the
    // "copy the previous period" mapping depends on.
    expect(weekdayOf("2026-08-25")).toBe(2);
    expect(weekdayOf("2026-09-01")).toBe(2);
    expect(weekdayOf("2026-09-06")).toBe(0);
    expect(weekdayOf("2026-09-05")).toBe(6);
  });

  it("does not shift across a month or leap-day boundary", () => {
    expect(weekdayOf("2024-02-29")).toBe(4);
    expect(weekdayOf("2024-03-01")).toBe(5);
  });
});
