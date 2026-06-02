import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { createDb } from "../../db/client";
import {
  ACCESS_TOKEN_COOKIE,
  getStoreByAccessToken,
  type StoreSession,
} from "../auth";
import { errorResponse } from "../http";

/**
 * Shared Hono environment type for authenticated routes.
 * Extends Bindings with a Variables map that holds the resolved store session.
 */
export type AuthEnv = { Bindings: Env; Variables: { store: StoreSession } };

/**
 * Hono middleware that resolves the admin access_token cookie to a StoreSession.
 * Sets c.var.store on success; returns 401 if the token is missing or invalid.
 *
 * Usage: router.use(requireStore) — applies to all subsequent handlers.
 */
export const requireStore = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, ACCESS_TOKEN_COOKIE)?.trim() ?? "";
  if (!token) {
    return errorResponse("UNAUTHORIZED", "Authentication required", 401);
  }

  const store = await getStoreByAccessToken(createDb(c.env.DB), token);
  if (!store) {
    return errorResponse("UNAUTHORIZED", "Authentication required", 401);
  }

  c.set("store", store);
  await next();
});
