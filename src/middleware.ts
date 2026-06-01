import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { createDb } from "./db/client";
import { ACCESS_TOKEN_COOKIE, getStoreByAccessToken } from "./lib/auth";

/**
 * Protects all /admin/* routes with access_token cookie authentication.
 * On success, sets Astro.locals.store so admin pages avoid an extra DB query.
 * On failure, redirects to /register.
 *
 * All other routes pass through without modification.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith("/admin")) {
    return next();
  }

  const token = context.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim() ?? "";

  if (!token) {
    return context.redirect("/register");
  }

  const db = createDb(env.DB);
  const store = await getStoreByAccessToken(db, token);

  if (!store) {
    return context.redirect("/register");
  }

  context.locals.store = store;
  return next();
});
