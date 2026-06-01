/**
 * Astro catch-all API endpoint.
 * Delegates every request under /api/* to the Hono application.
 *
 * Using a single catch-all instead of per-resource files keeps the Astro
 * layer thin: new API endpoints are added in src/lib/api/ without touching
 * this file.
 */

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { app } from "../../lib/api";

export const ALL: APIRoute = ({ request }) => app.fetch(request, env);
