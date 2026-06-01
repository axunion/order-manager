import { defineConfig } from 'drizzle-kit';

// d1-http driver is intentionally disabled.
// Production migrations run only via GitHub Actions (wrangler d1 migrations apply --remote).
// Local schema changes: edit src/db/schema.ts → pnpm db:generate → pnpm db:migrate
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // driver: 'd1-http',
  // dbCredentials: {
  //   accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  //   databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
  //   token: process.env.CLOUDFLARE_D1_TOKEN!,
  // },
});
