/**
 * Returns the current time as a Unix millisecond timestamp.
 * Used for created_at / closed_at / paid_at columns (stored as INTEGER in D1).
 */
export const now = (): number => Date.now();

/** Japan Standard Time is a fixed UTC+9 offset — no DST to account for. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Returns the `[from, to)` Unix ms range covering a JST calendar day
 * (00:00 JST inclusive to 24:00 JST exclusive) for a "YYYY-MM-DD" date
 * string. Used to scope sales-history queries to a business day.
 */
export function jstDayRange(dateStr: string): { from: number; to: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date string (expected YYYY-MM-DD): ${dateStr}`);
  }
  const [, year, month, day] = match;
  const from =
    Date.UTC(Number(year), Number(month) - 1, Number(day)) - JST_OFFSET_MS;
  return { from, to: from + 24 * 60 * 60 * 1000 };
}

/** Parses a "YYYY-MM-DD" string into a UTC-midnight Date (calendar math only,
 * not an actual instant — JST conversion happens via jstDayRange below). */
function parseDateStr(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date string (expected YYYY-MM-DD): ${dateStr}`);
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function formatDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the `[from, to)` Unix ms range covering the Monday-start JST
 * calendar week containing `dateStr` (Monday 00:00 JST inclusive to the
 * following Monday 00:00 JST exclusive).
 */
export function jstWeekRange(dateStr: string): { from: number; to: number } {
  const date = parseDateStr(dateStr);
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  return {
    from: jstDayRange(formatDateStr(monday)).from,
    to: jstDayRange(formatDateStr(nextMonday)).from,
  };
}

/**
 * Returns the `[from, to)` Unix ms range covering the JST calendar month
 * containing `dateStr` (1st 00:00 JST inclusive to the 1st of the
 * following month 00:00 JST exclusive).
 */
export function jstMonthRange(dateStr: string): { from: number; to: number } {
  const date = parseDateStr(dateStr);
  const firstOfMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const firstOfNextMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );
  return {
    from: jstDayRange(formatDateStr(firstOfMonth)).from,
    to: jstDayRange(formatDateStr(firstOfNextMonth)).from,
  };
}

/**
 * Converts a Unix ms timestamp to its JST calendar date as "YYYY-MM-DD",
 * independent of the host's local timezone (Workers always run in UTC).
 */
export function toJstDateString(ms: number): string {
  const jst = new Date(ms + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns today's JST calendar date as "YYYY-MM-DD". */
export function todayJst(): string {
  return toJstDateString(now());
}

/**
 * Converts a Unix ms timestamp to its JST day of week: 0 = Sunday, 1 =
 * Monday, ..., 6 = Saturday. Used for weekday-breakdown sales reports.
 */
export function toJstWeekday(ms: number): number {
  const jst = new Date(ms + JST_OFFSET_MS);
  return jst.getUTCDay();
}

/**
 * Converts a Unix ms timestamp to its JST hour of day (0-23). Used for
 * time-of-day-breakdown sales reports.
 */
export function toJstHour(ms: number): number {
  const jst = new Date(ms + JST_OFFSET_MS);
  return jst.getUTCHours();
}
