---
name: new-route
description: Scaffold a new Hono API route with Zod validation and a corresponding vitest worker-runtime test. Use this whenever adding a new endpoint to apps/api — it ensures routes follow the project's response conventions, auth patterns, and test structure. Pass the route name and method as arguments (e.g., /new-route products GET).
---

## Project patterns to follow

**Route file** (`apps/api/src/routes/<name>.ts`):
- `new Hono<{ Bindings: Env }>()`
- Use `bodyValidator` from `../validator` for POST/PATCH body parsing
- Access validated body via `c.req.valid("json")`
- Access D1 via `createDb(c.env.DB)` from `@order/db`
- Return errors with `errorResponse(code, message, status)` from `@order/core`
- Return success as `c.json({ data: ... }, status)`
- Mount the router in `apps/api/src/app.ts`

**Test file** (`apps/api/src/routes/<name>.test.ts`):
- Start with `/// <reference types="@cloudflare/vitest-pool-workers/types" />`
- Import `{ env } from "cloudflare:workers"`
- Use `app.request(path, init, env)` — always pass `env` as the third argument
- Import helpers from `../test-helpers`: `seedStore`, `withAuth`, `jsonInit`, `extractSessionToken`
- Each test is fully self-contained; use `crypto.randomUUID()` for unique email/name seeds to avoid D1 UNIQUE conflicts across tests in the same pool run

## Steps

1. If route name and HTTP method were provided as arguments, use them. Otherwise ask the user for: route name, HTTP methods, and auth requirement (public / admin session cookie / qr_token).
2. Create the test file first, covering: happy path, validation errors (missing/invalid fields), and auth rejection if applicable.
3. Create the route file following the patterns above and referencing existing routes for the auth type.
4. Mount the route in `apps/api/src/app.ts`.
5. Run `pnpm --filter @order/api test` to verify the tests pass.
6. Run `pnpm check` to verify types and linting pass across all workspaces.
