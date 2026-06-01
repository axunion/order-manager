/**
 * Response envelope helpers matching the API contract in docs/architecture.md §7.
 *
 * Success:  { "data": { ... } }
 * Error:    { "error": { "code": "...", "message": "..." } }
 */

/** Returns a JSON response wrapping the payload in `{ data }`. */
export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json({ data }, { status });
}

/** Returns a JSON response wrapping the error in `{ error: { code, message } }`. */
export function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } }, { status });
}
