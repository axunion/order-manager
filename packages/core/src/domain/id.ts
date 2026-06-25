/**
 * Generates a new UUID v4 identifier.
 * Uses the Web Crypto API, available in both Cloudflare Workers and Node.js 22+.
 */
export const newId = (): string => crypto.randomUUID();
