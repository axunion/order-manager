import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { schema } from "../db/client";

/** Name of the HttpOnly cookie used to authenticate admin requests. */
export const ACCESS_TOKEN_COOKIE = "access_token";

/**
 * Minimum store fields needed for authentication and page rendering.
 * Deliberately excludes access_token (the secret used to look up this record)
 * and other columns not needed at the session layer.
 */
export type StoreSession = {
  id: string;
  name: string;
};

/**
 * Looks up the store matching the given access token.
 * Returns a StoreSession (id + name only) or null if the token is invalid.
 *
 * Selects only the columns needed — access_token is never returned to callers.
 */
export async function getStoreByAccessToken(
  db: Database,
  token: string,
): Promise<StoreSession | null> {
  const result = await db
    .select({ id: schema.stores.id, name: schema.stores.name })
    .from(schema.stores)
    .where(eq(schema.stores.access_token, token))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Builds a Set-Cookie header value for the admin access token.
 *
 * Pass `secure: true` in production (HTTPS) environments.
 * Omit or set `secure: false` for local dev (wrangler dev serves HTTP on localhost,
 * where the Secure attribute would prevent the browser from sending the cookie).
 *
 * Attributes:
 *  - HttpOnly: prevents JS access (XSS mitigation)
 *  - SameSite=Lax: CSRF protection for top-level navigations
 *  - Path=/: cookie sent for all paths
 *  - Secure: added when secure=true (production HTTPS only)
 */
export function buildAuthCookie(token: string, secure = false): string {
  const parts = [
    `${ACCESS_TOKEN_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
