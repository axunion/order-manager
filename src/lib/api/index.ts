import { Hono } from "hono";
import { menuRouter } from "./menu";
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

export { app };
