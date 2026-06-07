// @ts-check
import cloudflare from "@astrojs/cloudflare";
import solidJs from "@astrojs/solid-js";
import { defineConfig } from "astro/config";

export default defineConfig({
  adapter: cloudflare(),
  output: "server",
  integrations: [solidJs()],
  vite: {
    css: {
      transformer: "lightningcss",
    },
  },
});
