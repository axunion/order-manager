import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// Read migrations once at config time so tests can apply them via setup file.
const migrations = await readD1Migrations(
  path.join(import.meta.dirname, "drizzle"),
);

export default defineConfig({
  test: {
    projects: [
      // -----------------------------------------------------------------------
      // node — pure logic, schema metadata, and SolidJS component tests
      // -----------------------------------------------------------------------
      {
        plugins: [solid()],
        test: {
          name: "node",
          environment: "happy-dom",
          include: [
            "src/db/**/*.test.ts",
            // glob covers all current and future src/lib/*.test.ts except api/
            "src/lib/*.test.ts",
            "src/components/**/*.test.tsx",
          ],
        },
      },
      // -----------------------------------------------------------------------
      // workers — API integration tests using real Cloudflare D1 via Miniflare
      // -----------------------------------------------------------------------
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.workers.jsonc" },
            miniflare: {
              // Injected as env.TEST_MIGRATIONS inside worker tests.
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        test: {
          name: "workers",
          include: ["src/lib/api/**/*.test.ts"],
          setupFiles: ["./test/apply-migrations.ts"],
        },
      },
    ],
  },
});
