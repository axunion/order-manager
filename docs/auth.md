# Authentication

Cross-origin authentication design for the order-manager monorepo.

---

## Overview

The monorepo runs four separate origins:

| App | Domain (production) | Domain (local dev) |
|---|---|---|
| Admin SPA | `admin.example.com` | `localhost:4173` |
| Order SPA | `order.example.com` | `localhost:4174` |
| Signup SPA | `signup.example.com` | `localhost:4175` |
| API Worker | `api.example.com` | `localhost:8787` |

Two authentication mechanisms are used:

1. **Session cookie** (`session_token`) — for admin and signup flows
2. **QR token URL parameter** (`qr_token`) — for the customer ordering screen

---

## Session cookie

### Attributes

```
Set-Cookie: session_token=<value>; HttpOnly; Secure; SameSite=None; Domain=.example.com; Max-Age=2592000
```

| Attribute | Value | Why |
|---|---|---|
| `HttpOnly` | — | Prevents JavaScript from reading the cookie |
| `Secure` | — | Required for `SameSite=None` to work |
| `SameSite=None` | — | Allows the cookie to be sent on cross-origin requests |
| `Domain=.example.com` | env var `COOKIE_DOMAIN` | Shared across all `*.example.com` subdomains |
| `Max-Age=2592000` | 30 days | |

### CORS

The API must allow credentials and enumerate each allowed origin explicitly (`*` is forbidden
when `Access-Control-Allow-Credentials: true`):

```ts
// apps/api/src/app.ts
app.use(cors({
  origin: [env.ADMIN_ORIGIN, env.ORDER_ORIGIN, env.SIGNUP_ORIGIN],
  credentials: true,
  allowHeaders: ["Content-Type"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
}));
```

### Frontend fetch

All API calls from frontend SPAs must include credentials so the browser sends the cookie:

```ts
// packages/core/src/client/index.ts
fetch(url, { credentials: "include", ...init })
```

`apiFetch` and `jsonFetch` from `@order/core/client` do this automatically.

---

## Magic Link flow

Used for both new store registration (signup) and returning admin login.

```
[Signup SPA]  POST /api/stores { name, email }
                  └─▶ API creates store + magic_link_token, sends email
[Signup SPA]  navigate to /check-email (local SPA route)

[Email link]  GET /api/auth/verify?token=<token>
                  └─▶ API validates token, creates session, sets cookie
                  └─▶ 302 redirect to ADMIN_ORIGIN (e.g. https://admin.example.com)

[Admin SPA]   mounts, AdminGuard calls GET /api/auth/me
                  └─▶ API returns { id, name } — session valid
                  └─▶ AdminGuard provides StoreContext to child routes
```

The login flow is identical from the `POST /api/auth/login` step onward.

**Key point**: The `verify` redirect must be an absolute URL (`c.env.ADMIN_ORIGIN`) because the
verify endpoint is served from `api.example.com`, not `admin.example.com`.

---

## SPA route guard (admin)

Since the admin app has no SSR, page-level auth is enforced client-side by `AdminGuard.tsx`.
It calls `GET /api/auth/me` on every protected route mount:

- **401** → navigate to `/login` (replace history entry so Back does not loop)
- **200** → render children with `StoreContext.Provider` providing `{ id, name }`

`GET /api/auth/me` is a lightweight session check endpoint added for this purpose.

Child pages access the store info via `useStoreInfo()` (wraps `useContext(StoreContext)`).

### Logout

```ts
// apps/admin/src/layouts/AdminLayout.tsx
await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
navigate("/login");
```

`navigate("/login")` is used instead of relying on the server's redirect response. A
cross-origin 302 redirect to `SIGNUP_ORIGIN` would be followed by the browser transparently,
but that behavior is inconsistent across CORS preflight caching — using client-side navigation
is more predictable.

---

## QR token flow (customer ordering)

The customer ordering screen authenticates via a `qr_token` embedded in the seat QR code URL:

```
https://order.example.com/<qr_token>
```

No session cookie is involved. Every API call for the order screen includes the token in the
path:

```
GET /api/order/<qr_token>           — bootstrap (seat + menu + current order)
POST /api/order/<qr_token>/items    — add items
PATCH /api/order/<qr_token>/request-payment
```

The `requireSeat` middleware in `apps/api` looks up the seat by `qr_token` and stores it on
the Hono context for downstream handlers.

**`credentials: "include"` is still sent** (from `apiFetch`), but the API ignores the cookie
for `/api/order/*` routes — they use `requireSeat` not `requireStore`.

---

## Required environment variables

### `apps/api` (wrangler.jsonc / .dev.vars)

| Variable | Example | Purpose |
|---|---|---|
| `ADMIN_ORIGIN` | `https://admin.example.com` | `verify` redirect target; CORS allowlist |
| `ORDER_ORIGIN` | `https://order.example.com` | CORS allowlist |
| `SIGNUP_ORIGIN` | `https://signup.example.com` | `logout` redirect target; CORS allowlist |
| `COOKIE_DOMAIN` | `.example.com` | Cookie `Domain` attribute |
| `RESEND_API_KEY` | `re_...` | Magic Link email delivery (secret) |
| `MAIL_FROM` | `noreply@example.com` | Magic Link `From` address |

### Frontend SPAs (`.env` / wrangler.jsonc `[vars]`)

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_API_BASE` | all SPAs | API base URL (e.g. `https://api.example.com`) |
| `VITE_ORDER_BASE` | admin SPA only | Order SPA base URL for QR code generation |

When `VITE_API_BASE` is unset, `apiFetch` sends relative requests (`/api/...`), which works
for local dev when a proxy forwards `/api/*` to the Wrangler dev server.

---

## Local development notes

`SameSite=None; Secure` requires HTTPS. For local development:

- Run all four servers on `localhost` with different ports. `localhost` is treated as a secure
  context by browsers, so cookies work without TLS.
- The cookie `Domain` attribute (`Domain=.example.com`) does **not** apply to `localhost` —
  the browser stores the cookie per `localhost` origin instead. This means cookie sharing
  across separate ports does not work with `Domain` set to `localhost`.
- **Workaround**: Set `COOKIE_DOMAIN` to an empty string (or omit it) in `wrangler.test.jsonc`
  and local `.dev.vars`, so the cookie is scoped to `localhost` without a `Domain` attribute.
  This is a local-only concern — production always uses `Domain=.example.com`.
