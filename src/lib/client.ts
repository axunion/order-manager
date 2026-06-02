/**
 * Shared browser-side API fetch helpers for SolidJS Islands.
 * Wraps fetch with the project's { data } / { error } response envelope.
 * No server-side imports — safe to use in any client component.
 */

/**
 * Fetches a URL and unwraps the { data } / { error } response envelope.
 * Returns { ok: true, data } on success or { ok: false, message } on failure.
 */
export async function apiFetch<T>(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; data?: T; message?: string }> {
  try {
    const res = await fetch(url, init);
    const body = (await res.json()) as
      | { data: T }
      | { error: { code: string; message: string } };
    if (!res.ok) {
      const errBody = body as { error: { code: string; message: string } };
      return {
        ok: false,
        message: errBody.error?.message ?? "エラーが発生しました",
      };
    }
    return { ok: true, data: (body as { data: T }).data };
  } catch {
    return {
      ok: false,
      message: "通信エラーが発生しました。再度お試しください。",
    };
  }
}

/** Convenience wrapper for JSON-body requests (POST, PATCH, PUT). */
export function jsonFetch<T>(
  url: string,
  method: string,
  body: unknown,
): Promise<{ ok: boolean; data?: T; message?: string }> {
  return apiFetch<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
