import { Hono } from "hono";
import { adminOrdersRouter } from "./admin-orders";
import { authRouter } from "./auth";
import { menuRouter } from "./menu";
import { orderRouter } from "./order";
import { paymentsRouter } from "./payments";
import { seatsRouter } from "./seats";
import { storesRouter } from "./stores";

/**
 * Root Hono application.
 * Mounted at the Astro catch-all endpoint: src/pages/api/[...path].ts
 */
const app = new Hono<{ Bindings: Env }>();

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
