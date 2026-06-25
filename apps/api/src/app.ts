import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { adminOrdersRouter } from "./routes/admin-orders";
import { authRouter } from "./routes/auth";
import { menuRouter } from "./routes/menu";
import { orderRouter } from "./routes/order";
import { paymentsRouter } from "./routes/payments";
import { seatsRouter } from "./routes/seats";
import { storesRouter } from "./routes/stores";

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

// Cross-origin requests from the three SPAs require CORS with credentials.
// The allowed origins are read from env at request time so they can be
// configured per-environment without rebuilding the Worker.
//
// Note: SameSite=None on the session_token cookie + credentials:true CORS is
// the strategy that allows a single API Worker to serve multiple SPA origins
// while keeping the cookie HttpOnly. The "Vary: Origin" header ensures
// downstream caches do not serve one origin's CORS headers to another.
const corsMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const allowed = [
    c.env.ADMIN_ORIGIN,
    c.env.ORDER_ORIGIN,
    c.env.SIGNUP_ORIGIN,
  ].filter(Boolean);

  const origin = c.req.header("Origin") ?? "";

  if (allowed.includes(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    c.header("Access-Control-Allow-Headers", "Content-Type");
    c.header("Vary", "Origin");
  }

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
});

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

app.use("*", corsMiddleware);

// Public endpoints
app.route("/api/stores", storesRouter);
app.route("/api/auth", authRouter);

// Admin-authenticated endpoints (session_token cookie)
app.route("/api/menu", menuRouter);
app.route("/api/seats", seatsRouter);
app.route("/api/admin/orders", adminOrdersRouter);
app.route("/api/payments", paymentsRouter);

// Customer-facing order API — authenticated via qr_token URL parameter
app.route("/api/order", orderRouter);

export { app };
