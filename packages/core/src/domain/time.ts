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
