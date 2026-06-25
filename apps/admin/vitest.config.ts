import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/setup.ts"],
    server: {
      deps: {
        inline: [/@order\/ui/, /@kobalte\//, /solid-/, /@corvu\//],
      },
    },
  },
});
