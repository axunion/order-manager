import { defineConfig } from "drizzle-kit";

// Local schema workflow: edit src/db/schema.ts -> pnpm db:generate -> pnpm db:reset
// Production migrations run only via GitHub Actions (wrangler d1 migrations apply --remote);
// never apply remote migrations from a local machine.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
