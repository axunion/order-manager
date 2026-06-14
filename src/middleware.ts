import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { createDb } from "./db/client";
import {
  deleteSession,
  getStoreBySession,
  SESSION_TOKEN_COOKIE,
} from "./lib/auth";

/**
 * Protects all /admin/* routes.
 *
 * Validates the session_token cookie against the sessions table and enforces
 * that the owning store is in "active" status. Redirects unauthenticated or
 * unauthorised requests to the appropriate page.
 *
 * Session validation flow (docs/onboarding.md §4):
 *   1. No cookie              → /login
 *   2. Token not in DB        → delete stale cookie token → /login
 *   3. Token expired          → delete session → /login
 *   4. store.status=pending   → /register/check-email
 *   5. store.status=suspended → /login  (TODO: dedicated error page)
 *   6. store.status=active    → set locals.store and continue
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith("/admin")) {
    return next();
  }

  const token = context.cookies.get(SESSION_TOKEN_COOKIE)?.value?.trim() ?? "";

  if (!token) {
    return context.redirect("/login");
  }

  const db = createDb(env.DB);
  const store = await getStoreBySession(db, token);

  if (!store) {
    // Session is missing or expired — clean up and redirect.
    await deleteSession(db, token);
    return context.redirect("/login");
  }

  if (store.status === "pending") {
    return context.redirect("/register/check-email");
  }

  if (store.status === "suspended") {
    return context.redirect("/login");
  }

  context.locals.store = store;
  return next();
});
