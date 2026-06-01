/**
 * Returns the current time as a Unix millisecond timestamp.
 * Used for created_at / closed_at / paid_at columns (stored as INTEGER in D1).
 */
export const now = (): number => Date.now();
