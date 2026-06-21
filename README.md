# order-manager

Multi-tenant mobile-order & POS SaaS for restaurants.

Restaurant owners sign up to get a store-specific admin dashboard and customer-facing QR ordering screens for each seat — all hosted on Cloudflare's global edge network.

> **Status:** Under active development. The MVP business cycle (registration → ordering → checkout) and Magic Link authentication are complete. Phase 2 and beyond are pending. See [docs/roadmap.md](docs/roadmap.md) for current progress.

---

## Tech Stack

- **Runtime**: Astro 6 SSR on Cloudflare Workers
- **UI**: SolidJS islands
- **API**: Hono + Zod
- **Database**: Drizzle ORM + Cloudflare D1 (SQLite)
- **Tooling**: Vitest, Biome, pnpm

---

## Getting Started

**Prerequisites**: Node.js ^24, pnpm ^11

```sh
# 1. Install dependencies
pnpm install

# 2. Configure local secrets
#    Copy .env.example to .dev.vars and fill in the values.
#    RESEND_API_KEY is optional — if omitted, Magic Link URLs are printed
#    to the console instead of being sent by email (handy for local dev).
cp .env.example .dev.vars

# 3. Apply database migrations locally
pnpm db:migrate

# 4. (Optional) Seed a dev account for local testing
pnpm seed:dev

# 5. Start the dev server at http://localhost:4321
pnpm dev
```

---

## Scripts

| Command          | Description                                      |
| :--------------- | :----------------------------------------------- |
| `pnpm dev`       | Start local dev server at `localhost:4321`       |
| `pnpm build`     | Build for production                             |
| `pnpm preview`   | Preview the production build locally             |
| `pnpm check`     | Lint (Biome) + type-check (Astro)                |
| `pnpm fix`       | Auto-fix lint issues                             |
| `pnpm test`      | Run all tests                                    |
| `pnpm db:generate` | Generate migration SQL from schema changes     |
| `pnpm db:migrate`  | Apply migrations to the local D1 database      |
| `pnpm db:reset`    | Wipe and re-migrate the local database         |
| `pnpm seed:dev`    | Seed a local dev account (local only)          |

---

## Project Structure

```
src/
├── pages/          # File-based routing (Astro)
│   ├── register/   # Store sign-up & Magic Link onboarding
│   ├── login.astro # Password-less login
│   ├── admin/      # Store management dashboard
│   └── order/      # Customer-facing QR ordering screen
├── components/
│   ├── admin/      # Admin-side SolidJS components
│   ├── order/      # Customer ordering components
│   ├── register/   # Sign-up form
│   └── ui/         # Shared UI primitives (Button, Field, Card, …)
├── lib/
│   ├── api/        # Hono route handlers
│   ├── auth.ts     # Session validation
│   └── email.ts    # Transactional email (Resend)
├── db/             # Drizzle schema & D1 client
└── styles/         # Design tokens & global CSS
```

See [docs/architecture.md](docs/architecture.md) for the full layout and design decisions.

---

## Documentation

Internal design docs are in [`docs/`](docs/):

1. [Requirements](docs/requirements.md) — What we're building: actors, screens, and MVP scope
2. [Architecture](docs/architecture.md) — Stack, directory layout, multi-tenant design, auth
3. [Data Model](docs/data-model.md) — Table definitions, state transitions, future extensions
4. [Onboarding](docs/onboarding.md) — Sign-up flow, Magic Link auth, session management
5. [Roadmap](docs/roadmap.md) — Phase breakdown and completion criteria
