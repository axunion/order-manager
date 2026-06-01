import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/**
 * Creates a Drizzle ORM client bound to a Cloudflare D1 database.
 * Call this once per request using the D1 binding from the Workers environment.
 *
 * @example
 * // In an Astro endpoint (Astro v6 / @astrojs/cloudflare v13+):
 * import { env } from "cloudflare:workers";
 * const db = createDb(env.DB);
 */
export function createDb(
  d1: D1Database,
): ReturnType<typeof drizzle<typeof schema>> {
  return drizzle(d1, { schema });
}

// Re-export schema so callers get type completions via a single import
export { schema };
