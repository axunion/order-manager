# Migration Guide

Mapping from the original `order-manager` project (Astro monolith) to this monorepo.

## What changed (top-level)

| Original | New | Notes |
|---|---|---|
| Single Astro app | 4 separate apps + 3 packages | Role separation |
| `astro.config.mjs` | Per-app `vite.config.ts` | Astro removed |
| `src/pages/*.astro` | `apps/*/index.html` + Solid router | Vite SPA entry |
| `src/pages/api/[...path].ts` | `apps/api/src/index.ts` (Workers `fetch` export) | Hono wired directly |
| `wrangler.jsonc` (1 Worker) | 4 `wrangler.jsonc` files | Per-app deployment |
| `pnpm-workspace.yaml` (no packages:) | Full pnpm workspace | Workspace activated |

## File-by-file mapping

### `packages/db/` ← `src/db/` + `drizzle/` + `drizzle.config.ts`

| Old path | New path |
|---|---|
| `src/db/schema.ts` | `packages/db/src/schema.ts` |
| `src/db/client.ts` | `packages/db/src/client.ts` |
| `drizzle/` | `packages/db/drizzle/` |
| `drizzle.config.ts` | `packages/db/drizzle.config.ts` |

### `packages/core/` ← `src/lib/*.ts` (non-API, non-Astro)

| Old path | New path | Subpath |
|---|---|---|
| `src/lib/auth.ts` | `packages/core/src/domain/auth.ts` | `@order/core/domain` |
| `src/lib/email.ts` | `packages/core/src/domain/email.ts` | `@order/core/domain` |
| `src/lib/http.ts` | `packages/core/src/domain/http.ts` | `@order/core/domain` |
| `src/lib/id.ts` | `packages/core/src/domain/id.ts` | `@order/core/domain` |
| `src/lib/order.ts` | `packages/core/src/domain/order.ts` | `@order/core/domain` |
| `src/lib/slug.ts` | `packages/core/src/domain/slug.ts` | `@order/core/domain` |
| `src/lib/time.ts` | `packages/core/src/domain/time.ts` | `@order/core/domain` |
| `src/lib/client.ts` | `packages/core/src/client/index.ts` | `@order/core/client` |
| *(new)* | `packages/core/src/types/` | API contract types |

### `packages/ui/` ← `src/components/ui/` + `src/styles/`

| Old path | New path |
|---|---|
| `src/components/ui/Button.tsx` | `packages/ui/src/components/Button.tsx` |
| `src/components/ui/Card.tsx` | `packages/ui/src/components/Card.tsx` |
| `src/components/ui/ConfirmDialog.tsx` | `packages/ui/src/components/ConfirmDialog.tsx` |
| `src/components/ui/ErrorAlert.tsx` | `packages/ui/src/components/ErrorAlert.tsx` |
| `src/components/ui/Field.tsx` | `packages/ui/src/components/Field.tsx` |
| `src/components/ui/Select.tsx` | `packages/ui/src/components/Select.tsx` |
| `src/styles/tokens.css` | `packages/ui/src/styles/tokens.css` |
| `src/styles/global.css` | `packages/ui/src/styles/global.css` |

### `apps/api/` ← `src/lib/api/` + `src/pages/api/[...path].ts`

| Old path | New path |
|---|---|
| `src/pages/api/[...path].ts` | `apps/api/src/index.ts` (Workers `fetch` export) |
| `src/lib/api/index.ts` | `apps/api/src/app.ts` (Hono app) |
| `src/lib/api/auth.ts` | `apps/api/src/routes/auth.ts` |
| `src/lib/api/menu.ts` | `apps/api/src/routes/menu.ts` |
| `src/lib/api/seats.ts` | `apps/api/src/routes/seats.ts` |
| `src/lib/api/order.ts` | `apps/api/src/routes/order.ts` |
| `src/lib/api/admin-orders.ts` | `apps/api/src/routes/admin-orders.ts` |
| `src/lib/api/payments.ts` | `apps/api/src/routes/payments.ts` |
| `src/lib/api/stores.ts` | `apps/api/src/routes/stores.ts` |
| `src/lib/api/middleware.ts` | `apps/api/src/middleware.ts` |
| `src/lib/api/test-helpers.ts` | `apps/api/src/test-helpers.ts` |

### `apps/admin/` ← `src/components/admin/` + `src/pages/admin/`

| Old path | New path |
|---|---|
| `src/components/admin/MenuManager.tsx` | `apps/admin/src/components/MenuManager.tsx` |
| `src/components/admin/SeatManager.tsx` | `apps/admin/src/components/SeatManager.tsx` |
| `src/components/admin/OrderBoard.tsx` | `apps/admin/src/components/OrderBoard.tsx` |
| `src/components/admin/CheckoutPanel.tsx` | `apps/admin/src/components/CheckoutPanel.tsx` |
| `src/components/login/LoginForm.tsx` | `apps/admin/src/components/LoginForm.tsx` |
| `src/layouts/AdminLayout.astro` | `apps/admin/src/layouts/AdminLayout.tsx` (Solid) |
| `src/middleware.ts` (Astro) | Replaced by `requireStore` middleware in `apps/api` |

### `apps/order/` ← `src/components/order/` + `src/pages/order/`

| Old path | New path |
|---|---|
| `src/components/order/OrderScreen.tsx` | `apps/order/src/components/OrderScreen.tsx` |
| `src/components/order/MenuList.tsx` | `apps/order/src/components/MenuList.tsx` |
| `src/components/order/OrderSummary.tsx` | `apps/order/src/components/OrderSummary.tsx` |

### `apps/signup/` ← `src/components/register/` + `src/pages/register/`

| Old path | New path |
|---|---|
| `src/components/register/RegisterForm.tsx` | `apps/signup/src/components/RegisterForm.tsx` |
| `src/pages/register.astro` | `apps/signup/src/App.tsx` |
| `src/pages/register/check-email.astro` | `apps/signup/src/pages/CheckEmail.tsx` |

---

## What to remove

| Original file/dep | Reason |
|---|---|
| `astro`, `@astrojs/*` | Astro removed |
| `lightningcss` | Was injected via Astro's vite config; add back via `vite.config.ts` if needed |
| `src/pages/*.astro` | Replaced by Vite SPA entry |
| `src/layouts/*.astro` | Replaced by Solid layout components |
| `src/middleware.ts` (Astro) | Replaced by Hono middleware in `apps/api` |
| `tsconfig.json` `extends: "astro/tsconfigs/strict"` | Replaced by `tsconfig.base.json` |
| `biome.json` `*.astro` override | Astro files no longer exist |
| `lefthook.yml` `pnpm astro check` | Replaced by `pnpm -r exec tsc --noEmit` |

---

## Porting notes

Non-obvious adaptations required when moving code from the original project.

### Astro files → Solid components

`.astro` page files are not portable — they must be rewritten as Solid components.
The mapping is conceptual, not mechanical:

| Astro construct | Solid equivalent |
|---|---|
| `src/pages/admin/index.astro` | `apps/admin/src/pages/AdminIndex.tsx` wired via Solid router |
| `src/layouts/AdminLayout.astro` | `apps/admin/src/layouts/AdminLayout.tsx` (plain Solid component) |
| `<slot />` | `props.children` |
| `client:load` directive | Not needed — everything is CSR by default in Vite SPA |
| `Astro.locals` / `Astro.cookies` | Not applicable; auth state comes from the API response |
| `src/middleware.ts` (Astro) | Replaced by `requireStore` middleware in `apps/api` |

The `.tsx` components under `src/components/admin/` and `src/components/order/` are already
plain Solid and can be moved with minimal changes — only the import paths need updating.

### Routing

The original project used Astro's file-based routing. The new SPAs need a client-side router.
Add `@solidjs/router` to each frontend app and define routes in `src/App.tsx`:

```tsx
// apps/admin/src/App.tsx
import { Route, Router } from "@solidjs/router";
import AdminGuard from "./layouts/AdminGuard";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  return (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={AdminGuard}>
        <Route path="/" component={DashboardPage} />
        {/* ... more protected routes ... */}
      </Route>
    </Router>
  );
}
```

The customer ordering app uses a URL parameter for seat identification:

```tsx
// apps/order/src/App.tsx
import { Route, Router } from "@solidjs/router";
import OrderPage from "./pages/OrderPage";

export default function App() {
  return (
    <Router>
      <Route path="/:seatToken" component={OrderPage} />
    </Router>
  );
}
```

`@solidjs/router` is listed as a dependency in each frontend app's `package.json`.

### Environment bindings (Workers `env`)

The original project accessed Cloudflare bindings through Astro's `locals` injected by
`@astrojs/cloudflare`. In the new project, `apps/api` is a plain Cloudflare Worker:

```ts
// apps/api/src/index.ts
import { app } from "./app";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
```

The Hono app already receives `env` via `c.env` (the original `src/lib/api/` code used this
pattern), so the Hono routes themselves require no changes — only the entry point changes.

### CSS Modules

CSS Module files (`*.module.css`) move alongside their component files with no changes needed.
The global design tokens import (`tokens.css`) that was injected via Astro's layout should
instead be imported in each app's entry point (`src/main.tsx`):

```ts
import "@order/ui/styles/tokens.css";
import "@order/ui/styles/global.css";
```

### Authentication

The original project used Astro middleware to protect `/admin/*` pages server-side, then a
second `requireStore` middleware in Hono. The new project removes the Astro layer entirely —
auth is handled **only** by Hono middleware in `apps/api`.

**Cookie changes**: The original session cookie was `SameSite=Lax` (same-origin). The new
project uses separate origins per app, so the cookie must be:
```
Set-Cookie: session_token=...; HttpOnly; Secure; SameSite=None; Domain=.example.com; Max-Age=...
```
`Domain=.example.com` shares the cookie across all `*.example.com` subdomains.

**Magic Link redirect**: The original `verify` endpoint redirected to a relative path (`/admin`).
The new endpoint redirects to `c.env.ADMIN_ORIGIN` (an absolute URL env var) so it lands on the
correct separate domain.

**SPA route guard** (`apps/admin`): Since there is no SSR, page-level auth is enforced
client-side. `AdminGuard.tsx` calls `GET /api/auth/me` on mount; a 401 response navigates to
`/login`. The guard also provides `StoreContext` with `{ id, name }` to child routes:

```tsx
// apps/admin/src/layouts/AdminGuard.tsx (simplified)
export default function AdminGuard(props) {
  const navigate = useNavigate();
  const [store, setStore] = createSignal(null);
  onMount(async () => {
    const result = await apiFetch("/api/auth/me");
    if (!result.ok) { navigate("/login", { replace: true }); return; }
    setStore(result.data);
  });
  return <Show when={store()}>{(s) => <StoreContext.Provider value={s()}>{props.children}</StoreContext.Provider>}</Show>;
}
```

**Logout**: Instead of relying on a server-side redirect, call `POST /api/auth/logout` then
`navigate("/login")` within the SPA to avoid cross-origin redirect issues.

See `docs/auth.md` for the full cross-origin authentication design.

### lightningcss

`lightningcss` was included as a transitive dependency of Astro. In the new project it is not
installed automatically, but each frontend app's `vite.config.ts` enables it explicitly:

```ts
// apps/admin/vite.config.ts (and similarly for order, signup)
export default defineConfig({
  plugins: [solid()],
  css: { transformer: "lightningcss" },
});
```

Install `lightningcss` as a dev dependency in any app that uses it if Vite cannot find it.

### Test files

Test files (`*.test.ts`, `*.test.tsx`) move with their source files. The only change needed
is updating import paths (`../../lib/...` → `@order/core/...`, etc.).

For `apps/api` integration tests, add `test/apply-migrations.ts` (see the original
`test/apply-migrations.ts` in the reference project) before running the workers test suite.

For frontend app tests (`happy-dom`), add `server.deps.inline` in `vitest.config.ts` so that
transitive Solid/Kobalte dependencies that ship `.jsx` files are bundled by Vitest instead of
being handed to Node.js native ESM (which rejects `.jsx`):

```ts
// apps/admin/vitest.config.ts (and similarly for order, signup)
server: {
  deps: {
    inline: [/@order\/ui/, /@kobalte\//, /solid-/, /@corvu\//],
  },
},
```

---

## Migration order

Implement in this order to keep the repo always buildable:

1. **`packages/db`** — schema + client (no other workspace deps)
2. **`packages/core`** — types + domain + client (depends only on zod)
3. **`packages/ui`** — Solid components + tokens (depends on core)
4. **`apps/api`** — Hono routes + middleware (depends on core + db); add integration tests
5. **`apps/admin`** — admin UI + login (depends on core + ui); add component tests
6. **`apps/order`** — customer ordering UI (depends on core + ui); add component tests
7. **`apps/signup`** — sign-up flow (depends on core + ui); add component tests
