/**
 * Shared request helpers for workers-project integration tests.
 * Import from this file instead of defining local copies in each test file.
 */

/** Extracts the access_token value from a Set-Cookie response header. */
export function extractAccessToken(res: Response): string {
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  const m = setCookie.match(/access_token=([^;]+)/);
  if (!m) throw new Error("access_token cookie not found in Set-Cookie header");
  return m[1];
}

/** Returns RequestInit with the admin access_token Cookie appended. */
export function withAuth(
  access_token: string,
  extra: RequestInit = {},
): RequestInit {
  return {
    ...extra,
    headers: {
      ...(extra.headers as Record<string, string> | undefined),
      Cookie: `access_token=${access_token}`,
    },
  };
}

/** Returns RequestInit for a JSON request (method + Content-Type + body). */
export function jsonInit(
  method: string,
  body: unknown,
  extra: RequestInit = {},
): RequestInit {
  return {
    ...extra,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(extra.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  };
}
