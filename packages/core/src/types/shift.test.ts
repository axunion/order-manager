import { describe, expect, it } from "vitest";
import {
  CreateSchedulePeriodInput,
  CreateShiftInput,
  CreateShiftPatternInput,
  CreateStaffingRequirementInput,
  SaveAvailabilityInput,
  UpdateMemberPositionsInput,
  UpdateMemberWorkProfileInput,
} from "./shift";

const baseShift = {
  period_id: "p1",
  member_id: "m1",
  work_date: "2026-09-01",
  start_minutes: 540,
  end_minutes: 1020,
  break_minutes: 60,
};

describe("work_date validation", () => {
  it("accepts a real calendar date", () => {
    expect(CreateShiftInput.safeParse(baseShift).success).toBe(true);
  });

  it("rejects a calendar-invalid date", () => {
    const result = CreateShiftInput.safeParse({
      ...baseShift,
      work_date: "2026-02-30",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unpadded date, which the DB's format check also refuses", () => {
    const result = CreateShiftInput.safeParse({
      ...baseShift,
      work_date: "2026-9-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateShiftInput times", () => {
  it("rejects an end at or before the start", () => {
    expect(
      CreateShiftInput.safeParse({ ...baseShift, end_minutes: 540 }).success,
    ).toBe(false);
    expect(
      CreateShiftInput.safeParse({ ...baseShift, end_minutes: 400 }).success,
    ).toBe(false);
  });

  it("rejects a start that is not a time of day", () => {
    expect(
      CreateShiftInput.safeParse({
        ...baseShift,
        start_minutes: 1440,
        end_minutes: 1500,
      }).success,
    ).toBe(false);
  });

  it("accepts an overnight shift but rejects one longer than 24 hours", () => {
    expect(
      CreateShiftInput.safeParse({
        ...baseShift,
        start_minutes: 1260,
        end_minutes: 1500,
        break_minutes: 0,
      }).success,
    ).toBe(true);
    expect(
      CreateShiftInput.safeParse({
        ...baseShift,
        start_minutes: 540,
        end_minutes: 540 + 1441,
        break_minutes: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a break that leaves no worked time", () => {
    expect(
      CreateShiftInput.safeParse({ ...baseShift, break_minutes: 480 }).success,
    ).toBe(false);
    expect(
      CreateShiftInput.safeParse({ ...baseShift, break_minutes: -1 }).success,
    ).toBe(false);
  });

  it("defaults the break to zero", () => {
    const { break_minutes: _omitted, ...withoutBreak } = baseShift;
    const result = CreateShiftInput.parse(withoutBreak);
    expect(result.break_minutes).toBe(0);
  });
});

describe("CreateSchedulePeriodInput", () => {
  const deadline = Date.UTC(2026, 7, 25);

  it("accepts both halves of a month", () => {
    expect(
      CreateSchedulePeriodInput.safeParse({
        start_date: "2026-09-01",
        end_date: "2026-09-15",
        submission_deadline: deadline,
      }).success,
    ).toBe(true);
    expect(
      CreateSchedulePeriodInput.safeParse({
        start_date: "2026-09-16",
        end_date: "2026-09-30",
        submission_deadline: deadline,
      }).success,
    ).toBe(true);
  });

  it("accepts a February second half ending on the 28th or 29th", () => {
    expect(
      CreateSchedulePeriodInput.safeParse({
        start_date: "2026-02-16",
        end_date: "2026-02-28",
        submission_deadline: deadline,
      }).success,
    ).toBe(true);
    expect(
      CreateSchedulePeriodInput.safeParse({
        start_date: "2028-02-16",
        end_date: "2028-02-29",
        submission_deadline: deadline,
      }).success,
    ).toBe(true);
  });

  it("rejects a range that is not a whole half-month", () => {
    for (const range of [
      { start_date: "2026-09-01", end_date: "2026-09-30" },
      { start_date: "2026-09-02", end_date: "2026-09-15" },
      { start_date: "2026-09-16", end_date: "2026-09-29" },
      { start_date: "2026-09-16", end_date: "2026-10-15" },
    ]) {
      expect(
        CreateSchedulePeriodInput.safeParse({
          ...range,
          submission_deadline: deadline,
        }).success,
      ).toBe(false);
    }
  });
});

describe("SaveAvailabilityInput", () => {
  const entry = {
    work_date: "2026-09-01",
    kind: "available" as const,
    start_minutes: 540,
    end_minutes: 1020,
  };

  it("accepts available bands and whole-day requests together", () => {
    const result = SaveAvailabilityInput.safeParse({
      submit: true,
      entries: [entry, { work_date: "2026-09-02", kind: "day_off" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an available entry with no times", () => {
    expect(
      SaveAvailabilityInput.safeParse({
        submit: false,
        entries: [{ work_date: "2026-09-01", kind: "available" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a day_off entry carrying times", () => {
    expect(
      SaveAvailabilityInput.safeParse({
        submit: false,
        entries: [{ ...entry, kind: "day_off" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a band that runs backwards", () => {
    expect(
      SaveAvailabilityInput.safeParse({
        submit: false,
        entries: [{ ...entry, start_minutes: 1020, end_minutes: 540 }],
      }).success,
    ).toBe(false);
  });

  it("accepts an empty submission — a member with no availability at all", () => {
    expect(
      SaveAvailabilityInput.safeParse({ submit: true, entries: [] }).success,
    ).toBe(true);
  });

  it("caps the number of entries", () => {
    const entries = Array.from({ length: 501 }, () => entry);
    expect(
      SaveAvailabilityInput.safeParse({ submit: false, entries }).success,
    ).toBe(false);
  });

  it("defaults submit to false so a save is a draft unless asked", () => {
    const result = SaveAvailabilityInput.parse({ entries: [entry] });
    expect(result.submit).toBe(false);
  });
});

describe("CreateStaffingRequirementInput", () => {
  const base = {
    weekday: 5,
    position_id: "hall",
    start_minutes: 1020,
    end_minutes: 1320,
    required_headcount: 2,
  };

  it("accepts a valid requirement", () => {
    expect(CreateStaffingRequirementInput.safeParse(base).success).toBe(true);
  });

  it("rejects a weekday outside 0-6", () => {
    expect(
      CreateStaffingRequirementInput.safeParse({ ...base, weekday: 7 }).success,
    ).toBe(false);
    expect(
      CreateStaffingRequirementInput.safeParse({ ...base, weekday: -1 })
        .success,
    ).toBe(false);
  });

  it("accepts a zero headcount but rejects a negative one", () => {
    expect(
      CreateStaffingRequirementInput.safeParse({
        ...base,
        required_headcount: 0,
      }).success,
    ).toBe(true);
    expect(
      CreateStaffingRequirementInput.safeParse({
        ...base,
        required_headcount: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects a band that runs backwards", () => {
    expect(
      CreateStaffingRequirementInput.safeParse({
        ...base,
        start_minutes: 1320,
        end_minutes: 1020,
      }).success,
    ).toBe(false);
  });
});

describe("CreateShiftPatternInput", () => {
  it("trims the name and rejects an empty one", () => {
    const result = CreateShiftPatternInput.parse({
      name: "  早番  ",
      start_minutes: 540,
      end_minutes: 1020,
    });
    expect(result.name).toBe("早番");

    expect(
      CreateShiftPatternInput.safeParse({
        name: "   ",
        start_minutes: 540,
        end_minutes: 1020,
      }).success,
    ).toBe(false);
  });
});

describe("member roster inputs", () => {
  it("accepts a null wage and cap, meaning 'not recorded'", () => {
    const result = UpdateMemberWorkProfileInput.parse({
      hourly_wage: null,
      weekly_cap_minutes: null,
      is_minor: true,
    });
    expect(result.hourly_wage).toBeNull();
    expect(result.is_minor).toBe(true);
  });

  it("rejects a negative wage and a non-positive cap", () => {
    expect(
      UpdateMemberWorkProfileInput.safeParse({
        hourly_wage: -1,
        weekly_cap_minutes: null,
        is_minor: false,
      }).success,
    ).toBe(false);
    expect(
      UpdateMemberWorkProfileInput.safeParse({
        hourly_wage: null,
        weekly_cap_minutes: 0,
        is_minor: false,
      }).success,
    ).toBe(false);
  });

  it("accepts an empty position list, which clears the assignments", () => {
    expect(
      UpdateMemberPositionsInput.safeParse({ position_ids: [] }).success,
    ).toBe(true);
  });

  it("rejects duplicate positions in one assignment", () => {
    expect(
      UpdateMemberPositionsInput.safeParse({ position_ids: ["a", "a"] })
        .success,
    ).toBe(false);
  });
});
