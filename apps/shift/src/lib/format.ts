/**
 * Display formatting for the shift screens. Minutes are offsets from the
 * business date's 00:00, so a value past 1440 renders as 25:00 rather than
 * wrapping to 01:00 — that is what tells a reader the shift runs overnight.
 */

/** 540 -> "09:00", 1500 -> "25:00". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** "2026-09-01" -> 2. Sunday is 0, as in Date#getUTCDay. */
export function weekdayOf(workDate: string): number {
  const [year = "", month = "", day = ""] = workDate.split("-");
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  ).getUTCDay();
}

/** "2026-09-01" -> "9/1(火)". */
export function formatWorkDate(workDate: string): string {
  const [, month = "", day = ""] = workDate.split("-");
  return `${Number(month)}/${Number(day)}(${WEEKDAYS[weekdayOf(workDate)] ?? ""})`;
}
