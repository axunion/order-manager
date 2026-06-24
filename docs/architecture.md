# Architecture

## Why we rebuilt

The original `order-manager` used a single Astro SSR app that served both the admin console
and the customer ordering screen from one Cloudflare Worker. This made it impossible to:

- Deploy the two surfaces independently (different release cadences, different downtime tolerance)
- Scale them separately (the ordering screen must stay up even during admin maintenance)
- Enforce strict code boundaries (shared files were imported in both directions freely)

The new project replaces Astro with **Vite SPA (CSR)** per app and moves the shared Hono API
into a dedicated Worker. Solid and Hono stay; Astro is fully removed.

---

## Workspace layout

```
order-manager-new/
├── apps/
│   ├── admin/    Management console + login (Vite + Solid → static assets)
│   ├── order/    Customer ordering screen (Vite + Solid → static assets)
│   ├── signup/   Merchant sign-up site (Vite + Solid → static assets)
│   └── api/      REST API (Hono on Cloudflare Workers + D1)
└── packages/
    ├── db/       Drizzle schema, migrations, D1 client — server only
    ├── core/     Shared types, pure logic, browser fetch client — no DB or UI
    └── ui/       Shared Solid components + design tokens — frontend only
```

---

## Dependency rules

```
apps/admin ─┐
apps/order ─┼──▶ @order/ui ──▶ @order/core
apps/signup ┘       │
            └───────────────▶ @order/core

apps/api ──────────────────▶ @order/core
         └──────────────────▶ @order/db ──▶ drizzle-orm
```

**Enforced prohibitions:**

| Prohibited import | Reason |
|---|---|
| `apps/*` → `@order/db` | Frontends must not include server DB logic |
| `apps/api` → `@order/ui` | API Worker must not bundle Solid/UI code |
| Any circular dependency | Breaks bundling and reasoning |

`@order/core` is the only package imported by every app. It has **zero** dependencies on DB or UI,
making it safe to share across all environments (browser, Worker).

### `@order/core` subpath exports

| Export | Contents | Consumers |
|---|---|---|
| `@order/core/types` | API contract types (request/response shapes) | all apps |
| `@order/core/domain` | Pure logic: id, time, slug, order totals, HTTP envelope | all apps |
| `@order/core/client` | Browser `apiFetch` / `jsonFetch` helpers | frontend apps only |

`apps/api` should only import `@order/core/types` and `@order/core/domain`, never `@order/core/client`.

---

## Deployment model (Cloudflare)

| Worker | Source | Assets | D1 |
|---|---|---|---|
| `order-manager-admin` | `apps/admin` | `dist/` (Vite build) | ✗ |
| `order-manager-order` | `apps/order` | `dist/` (Vite build) | ✗ |
| `order-manager-signup` | `apps/signup` | `dist/` (Vite build) | ✗ |
| `order-manager-api` | `apps/api` | — | ✓ (binding `DB`) |

Frontend Workers serve static SPAs. All data fetching goes through `order-manager-api`.
There is no server-side rendering for the frontend Workers.

### API surface

| Path prefix | Auth method | Consumer |
|---|---|---|
| `/api/auth` | — | all (login, magic link) |
| `/api/stores` | — | all (public store info) |
| `/api/menu` | session cookie | admin |
| `/api/seats` | session cookie | admin |
| `/api/admin/orders` | session cookie | admin |
| `/api/payments` | session cookie | admin |
| `/api/order` | `qr_token` URL param | order screen |

---

## Database

- Provider: **Cloudflare D1** (SQLite at the edge)
- Schema and migrations live in `packages/db/` so they are decoupled from the API implementation.
- `apps/api/wrangler.jsonc` references `../../packages/db/drizzle` as `migrations_dir`.
- Local migrations run via `pnpm db:migrate` (applies to `apps/api/.wrangler/` state directory).
- **Production migrations run only via GitHub Actions** (`wrangler d1 migrations apply --remote`).
  Never run `--remote` from a local machine.

---

## Authentication

- Admin / signup: **Magic Link** email flow → session cookie (`session_token`)
- Customer ordering: **QR code** per seat → `qr_token` URL parameter (no cookie)
- Session validation, middleware, and auth utilities belong in `apps/api` (server) and `@order/core/domain` (pure logic).

---

## Real-time updates (deferred decision)

Two options remain open for the admin order board:

- **Option A (recommended for MVP)**: client-side polling every N seconds — zero infra cost
- **Option B (future)**: WebSocket via Cloudflare Durable Objects — lower latency but adds complexity

Implement Option A first; switch to B when polling latency becomes a UX problem.

---

## Styling

- **CSS Modules** per component for scoped styles
- Shared design tokens in `packages/ui/src/styles/tokens.css` (imported globally in each app)
- No CSS framework; no Tailwind; no runtime-in-JS
