/**
 * Shared local dev-server settings for the SPA apps (apps/admin, apps/order,
 * apps/signup). Each app passes its fixed port; the port must match
 * ADMIN_ORIGIN / ORDER_ORIGIN / SIGNUP_ORIGIN in apps/api/wrangler.jsonc for
 * CORS, and the proxy forwards relative /api/* calls to the local Wrangler
 * dev server (VITE_API_BASE is unset in local dev — see packages/core/src/client).
 */
export function devServerConfig(port: number) {
  return {
    port,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8787",
    },
  };
}
