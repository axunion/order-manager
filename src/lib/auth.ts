import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { schema } from "../db/client";
import { newId } from "./id";
import { now } from "./time";

/** Name of the HttpOnly cookie used to authenticate admin sessions. */
export const SESSION_TOKEN_COOKIE = "session_token";

/** Session lifetime: 30 days in milliseconds. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Magic Link token lifetime: 15 minutes in milliseconds. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

/**
 * Issues a Magic Link token for the given store and purpose.
 * Invalidates any previous unused token for the same store+purpose so only
 * one link is valid at a time.
 *
 * Insert-first ordering: the new token is written before old ones are deleted
 * so a DELETE failure leaves two temporarily valid tokens (harmless — the old
 * one expires naturally) while an INSERT failure leaves the old token intact.
 */
export async function issueMagicLink(
  db: Database,
  storeId: string,
  purpose: "signup" | "login",
): Promise<string> {
  const token = newId();
  const expires_at = now() + MAGIC_LINK_TTL_MS;

  await db.insert(schema.magicLinkTokens).values({
    id: newId(),
    store_id: storeId,
    token,
    purpose,
    expires_at,
  });

  await db
    .delete(schema.magicLinkTokens)
    .where(
      and(
        eq(schema.magicLinkTokens.store_id, storeId),
        eq(schema.magicLinkTokens.purpose, purpose),
        isNull(schema.magicLinkTokens.used_at),
        ne(schema.magicLinkTokens.token, token),
      ),
    );

  return token;
}

/**
 * Minimum store fields needed for authentication and page rendering.
 * Includes status so that middleware can enforce the active-only invariant.
 */
export type StoreSession = {
  id: string;
  name: string;
  status: "pending" | "active" | "suspended";
};

/**
 * Looks up the store matching the given session token.
 *
 * Returns a StoreSession or null when:
 *   - the token does not exist in the sessions table
 *   - the session has expired (expires_at <= now)
 *
 * Callers are responsible for enforcing stores.status === "active".
 * Expired sessions are NOT deleted here; callers should call deleteSession.
 */
export async function getStoreBySession(
  db: Database,
  token: string,
): Promise<StoreSession | null> {
  const result = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      status: schema.stores.status,
    })
    .from(schema.sessions)
    .innerJoin(schema.stores, eq(schema.sessions.store_id, schema.stores.id))
    .where(
      and(
        eq(schema.sessions.session_token, token),
        gt(schema.sessions.expires_at, now()),
      ),
    )
    .limit(1);
  return (result[0] as StoreSession | undefined) ?? null;
}

/**
 * Deletes the session identified by the given token.
 * Used to clean up expired sessions or on logout.
 * Silently succeeds if the session does not exist.
 */
export async function deleteSession(
  db: Database,
  token: string,
): Promise<void> {
  await db
    .delete(schema.sessions)
    .where(eq(schema.sessions.session_token, token));
}

/**
 * Minimum seat fields needed to identify the seat and its owning store.
 * Used by the customer order screen to resolve a qr_token URL parameter.
 */
export type SeatSession = {
  id: string;
  store_id: string;
  name: string;
};

/**
 * Looks up the seat matching the given qr_token.
 * Returns a SeatSession (id, store_id, name) or null if the token is invalid.
 *
 * Selects only the columns needed — qr_token is never returned to callers.
 */
export async function getSeatByQrToken(
  db: Database,
  token: string,
): Promise<SeatSession | null> {
  const result = await db
    .select({
      id: schema.seats.id,
      store_id: schema.seats.store_id,
      name: schema.seats.name,
    })
    .from(schema.seats)
    .where(eq(schema.seats.qr_token, token))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Builds a Set-Cookie header value for the admin session token.
 *
 * Pass `secure: true` in production (HTTPS) environments.
 * Omit or set `secure: false` for local dev (wrangler dev serves HTTP on
 * localhost, where the Secure attribute prevents the browser from sending
 * the cookie).
 *
 * Attributes:
 *  - HttpOnly: prevents JS access (XSS mitigation)
 *  - SameSite=Lax: CSRF protection for top-level navigations
 *  - Path=/: cookie sent for all paths
 *  - Max-Age: explicit 30-day expiry so the cookie survives browser restarts
 *  - Secure: added when secure=true (production HTTPS only)
 */
export function buildSessionCookie(token: string, secure = false): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000); // seconds
  const parts = [
    `${SESSION_TOKEN_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Builds a Set-Cookie header value that clears the admin session token.
 * Sets Max-Age=0 so the browser immediately deletes the cookie.
 */
export function buildClearSessionCookie(secure = false): string {
  const parts = [
    `${SESSION_TOKEN_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
