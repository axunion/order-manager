/**
 * Shared fetch stubbing for this app's component tests, following the
 * route-table pattern in apps/admin (no MSW, no fetch-mock library).
 */
import { vi } from "vitest";

export type MockRoute = {
  url: string | RegExp;
  method?: string;
  ok?: boolean;
  status?: number;
  json: unknown;
};

/**
 * Returns a fetch stub that answers the given routes in order. An unmatched
 * request answers 404 rather than throwing, so a test that forgets a route
 * fails on its own assertion instead of an unhandled rejection.
 */
export function mockFetch(routes: MockRoute[]) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes.find((candidate) => {
      const methodMatches =
        (candidate.method ?? "GET").toUpperCase() === method;
      const urlMatches =
        typeof candidate.url === "string"
          ? url === candidate.url || url.endsWith(candidate.url)
          : candidate.url.test(url);
      return methodMatches && urlMatches;
    });

    if (!route) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: "NOT_FOUND", message: "no route" },
        }),
      });
    }

    const ok = route.ok !== false;
    return Promise.resolve({
      ok,
      status: route.status ?? (ok ? 200 : 400),
      json: async () => route.json,
    });
  });
}

/** Wraps a payload in the API's success envelope. */
export const data = (payload: unknown) => ({ data: payload });

/** Wraps a code and message in the API's error envelope. */
export const apiError = (code: string, message = code) => ({
  error: { code, message },
});
