import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { devServerConfig } from "../../vite.dev-server.config";

export default defineConfig({
  plugins: [solid()],
  css: {
    transformer: "lightningcss",
  },
  // Fixed port: matches ORDER_ORIGIN in apps/api/wrangler.jsonc for local CORS.
  server: devServerConfig(5174),
});
