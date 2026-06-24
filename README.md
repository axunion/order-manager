# order-manager

Mobile order and point-of-sale SaaS for restaurants — pnpm monorepo.

## Structure

```
apps/
  admin/   Management console + login (Vite SPA → Cloudflare Worker)
  order/   Customer ordering screen via QR code (Vite SPA → Cloudflare Worker)
  signup/  Merchant sign-up site (Vite SPA → Cloudflare Worker)
  api/     Hono REST API (Cloudflare Worker + D1)

packages/
  db/      Drizzle schema, migrations, DB client — server only
  core/    Shared types, pure logic, browser fetch client — no DB/UI deps
  ui/      Shared Solid components + design tokens — frontend only
```

See [docs/](./docs/README.md) for architecture, monorepo operations, and migration guide.

## Prerequisites

- Node >= 24
- pnpm >= 11

## Getting started

```sh
pnpm install
pnpm dev:api      # start Hono Workers dev server
pnpm dev:admin    # start admin Vite dev server
pnpm dev:order    # start order Vite dev server
pnpm dev:signup   # start signup Vite dev server
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all apps |
| `pnpm check` | Biome lint + TypeScript type check |
| `pnpm fix` | Auto-fix lint/format issues |
| `pnpm test` | Run all tests |
| `pnpm db:generate` | Generate Drizzle migrations from schema changes |
| `pnpm db:migrate` | Apply migrations to local D1 |
| `pnpm db:reset` | Wipe and re-apply local D1 |
| `pnpm db:rebuild` | Regenerate + reset from scratch |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm seed:dev` | Seed local D1 with development data |
