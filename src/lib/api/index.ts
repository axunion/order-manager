import { Hono } from "hono";
import { adminOrdersRouter } from "./admin-orders";
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

app.route("/api/stores", storesRouter);
app.route("/api/menu", menuRouter);
app.route("/api/seats", seatsRouter);
// Customer-facing order API — authenticated via qr_token URL parameter
app.route("/api/order", orderRouter);
// Admin order management API — authenticated via access_token cookie
app.route("/api/admin/orders", adminOrdersRouter);
// Payments / checkout API — authenticated via access_token cookie
app.route("/api/payments", paymentsRouter);

export { app };
