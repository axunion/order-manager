/** Name of the HttpOnly cookie used to authenticate admin sessions. */
export const SESSION_TOKEN_COOKIE = "session_token";

/** Session lifetime: 30 days in milliseconds. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Magic Link token lifetime: 15 minutes in milliseconds. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

/**
 * Max Magic Link tokens issued per store per rolling hour (login,
 * signup-resend, and email-change combined). Protects the Resend quota
 * and a victim's inbox from abuse. Issuance beyond the cap is silently
 * skipped — the anti-enumeration response contract must not change.
 */
export const MAGIC_LINK_HOURLY_CAP = 5;

/** API path (no origin) that verifies a Magic Link token. */
export const MAGIC_LINK_VERIFY_PATH = "/api/auth/verify";

/**
 * Minimum store fields needed for authentication.
 * Includes status so that API middleware can enforce the active-only invariant.
 */
export type StoreSession = {
  id: string;
  name: string;
  status: "pending" | "active" | "suspended";
};

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
 * Builds a Set-Cookie header value for the admin session token.
 *
 * Cross-origin deployment note:
 *   The admin SPA and the API run on separate subdomains (e.g. admin.example.com
 *   and api.example.com). SameSite=None is required to allow the browser to send
 *   the cookie across origins. SameSite=None REQUIRES Secure=true (HTTPS), so
 *   always pass secure=true in production. Local dev typically runs on HTTP so
 *   set secure=false and use a workaround (same port proxy or --local-protocol https).
 *
 *   Pass domain=".example.com" to share the cookie across all subdomains.
 *   In local dev, omit domain so the cookie is scoped to localhost only.
 *
 * Attributes:
 *  - HttpOnly: prevents JS access (XSS mitigation)
 *  - SameSite=None: required for cross-origin fetch with credentials
 *  - Path=/: cookie sent for all paths
 *  - Max-Age: explicit 30-day expiry so the cookie survives browser restarts
 *  - Secure: required with SameSite=None (HTTPS only)
 *  - Domain: optional; set to parent domain to share across subdomains
 */
export function buildSessionCookie(
  token: string,
  options: { secure?: boolean; domain?: string } = {},
): string {
  return buildCookieHeader(token, Math.floor(SESSION_TTL_MS / 1000), options);
}

/**
 * Builds a Set-Cookie header value that clears the admin session token.
 * Sets Max-Age=0 so the browser immediately deletes the cookie.
 */
export function buildClearSessionCookie(
  options: { secure?: boolean; domain?: string } = {},
): string {
  return buildCookieHeader("", 0, options);
}

function buildCookieHeader(
  token: string,
  maxAge: number,
  options: { secure?: boolean; domain?: string } = {},
): string {
  const { secure = false, domain } = options;
  const parts = [
    `${SESSION_TOKEN_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=None",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}
