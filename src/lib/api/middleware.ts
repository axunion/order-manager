import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { createDb } from "../../db/client";
import {
  ACCESS_TOKEN_COOKIE,
  getSeatByQrToken,
  getStoreByAccessToken,
  type SeatSession,
  type StoreSession,
} from "../auth";
import { errorResponse } from "../http";

/**
 * Shared Hono environment type for admin-authenticated routes.
 * Extends Bindings with a Variables map that holds the resolved store session.
 */
export type AuthEnv = { Bindings: Env; Variables: { store: StoreSession } };

/**
 * Hono environment type for customer-facing order routes.
 * Extends Bindings with a Variables map that holds the resolved seat session.
 * The seat session includes both seat.id and seat.store_id so that every
 * DB query can apply a store_id filter without joining through orders.
 */
export type SeatEnv = { Bindings: Env; Variables: { seat: SeatSession } };

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

/**
 * Hono middleware that resolves the :seatToken URL parameter to a SeatSession.
 * Sets c.var.seat on success; returns 404 if the token is missing or invalid.
 *
 * Use as inline middleware on individual routes so the :seatToken path
 * parameter is guaranteed to be resolved before the middleware runs:
 *   router.get("/:seatToken", requireSeat, handler)
 *
 * Returns 404 (not 403) for unrecognised tokens to prevent cross-tenant
 * enumeration, consistent with the NOT_FOUND convention for other resources.
 */
export const requireSeat = createMiddleware<SeatEnv>(async (c, next) => {
  const seatToken = c.req.param("seatToken");
  if (!seatToken) {
    // seatToken param is absent — requireSeat must be used as inline per-route
    // middleware on a route that contains :seatToken, not as a global .use().
    return errorResponse(
      "INTERNAL_ERROR",
      "Server misconfiguration: seatToken route parameter missing",
      500,
    );
  }

  const seat = await getSeatByQrToken(createDb(c.env.DB), seatToken);
  if (!seat) {
    return errorResponse("NOT_FOUND", "Seat not found", 404);
  }

  c.set("seat", seat);
  await next();
});
