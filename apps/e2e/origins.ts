/**
 * Fixed local dev origins the E2E run drives.
 *
 * These ports are not configurable: each SPA pins its own port in its
 * vite.config.ts, and apps/api/wrangler.jsonc allowlists exactly these three
 * origins for CORS. Changing one here without changing both of those breaks
 * the run with a CORS failure rather than a useful test failure.
 */
export const API_ORIGIN = "http://localhost:8787";
export const ADMIN_ORIGIN = "http://localhost:5173";
export const ORDER_ORIGIN = "http://localhost:5174";
export const SIGNUP_ORIGIN = "http://localhost:5175";
