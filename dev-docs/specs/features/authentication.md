# Feature: Authentication & Account

Passwordless Magic Link auth for store owners. Technical architecture
(cookie strategy, cross-origin design) lives in
[reference/auth.md](../../reference/auth.md); this spec covers product
behavior.

## Actors

- **Owner** — the only account type. One email = one store.

## Current behavior

### Sign-up (`POST /api/stores`, from `apps/signup`)

1. Owner submits store name + email. A URL slug is derived from the name
   with a 5-char random suffix.
2. Store is created with `status = 'pending'` and a signup Magic Link
   (15 min TTL, single-use) is emailed via Resend.
3. Duplicate email → 400 with an explicit "already registered" message.
   Failure to issue the token compensates by deleting the store row so
   the owner can retry.
4. Email delivery failure leaves the store `pending`; the owner recovers
   via the login form (which resends the signup link).

### Login (`POST /api/auth/login`, form hosted in `apps/admin`)

- Always returns 200 with an identical body regardless of whether the
  email exists (anti-enumeration). Email delivery is deferred via
  `waitUntil` so response latency doesn't leak registration status either.
- Per store status: `active` → login link; `pending` → signup link
  resent; `suspended` / unknown → silently no email.
- Rate limited per store: see "Magic Link issuance cap" below.

### Verification (`GET /api/auth/verify?token=`)

- Validates the token (unused + unexpired), marks it consumed (kept for
  audit), activates the store on first signup, creates a session
  (30-day TTL), sets the `session_token` HttpOnly cookie, and redirects
  to the admin SPA.
- Every failure mode returns the same `INVALID_TOKEN` 400.

### Session & logout

- `GET /api/auth/me` resolves the session for SPA bootstrapping — returns
  `{ id, name, email }` (401 when invalid/expired). Admin routes are
  guarded by `requireStore`.
- `POST /api/auth/logout` deletes only the current session (other devices
  stay logged in), clears the cookie, redirects to the login page.
- Multiple concurrent sessions per store are allowed by design (shared
  staff devices).

### Store settings — rename & email change (`apps/admin` SettingsPage)

- `PATCH /api/stores/me` (`requireStore`, applied inline since
  `storesRouter` is otherwise public) updates the display name only; the
  slug is never regenerated (a stable identifier, not currently used by
  any feature).
- `POST /api/stores/me/email-change` (`requireStore`) issues a Magic
  Link with `purpose = 'email_change'` to the **new** address, proving
  control before the change applies. Rejects 400 if the address equals
  the current one or is already registered to another store — the
  caller is authenticated here, so anti-enumeration doesn't apply
  (unlike `/api/auth/login`).
- `GET /api/auth/verify` applies `stores.email` on `email_change` token
  verification, right after marking the token consumed and before
  session creation (same ordering as the `signup` → `stores.status =
  'active'` transition). A UNIQUE-constraint race — the address
  claimed by another store after the token was issued — fails
  generically as `INVALID_TOKEN`, same as any other invalid token.
- `magic_link_tokens.purpose` includes `'email_change'`; a nullable
  `new_email` column holds the pending target address for that purpose
  only (see [domain-model.md](../domain-model.md)).

### Magic Link issuance cap (rate limiting)

- `issueMagicLink` (`apps/api/src/auth.ts`) refuses to issue a token —
  returning `null` instead — once a store has reached
  `MAGIC_LINK_HOURLY_CAP` (5, `@order/core` `domain/auth.ts`) issuances
  in the last rolling hour, across signup-resend, login, and
  email-change combined. Callers (`POST /api/auth/login`,
  `POST /api/stores/me/email-change`) skip sending on `null` but return
  the exact same response as success — the anti-enumeration contract
  must not change shape when a store is rate-limited.
  `POST /api/stores` (initial signup) treats `null` as an issuance
  failure (compensating store-row delete, 500) since a brand-new
  `store_id` can never realistically hit the cap.
- Superseding the previous unused token for a store+purpose (so only
  one link is valid at a time) is done via `UPDATE ... SET used_at =
  now()`, not `DELETE` — the row must survive for the cap's count
  query to see it. `verify` already rejects any token with `used_at`
  set, so this changes nothing about which tokens are accepted.
- Complementary per-IP flood protection is Cloudflare WAF config, not
  Worker code — see
  [reference/deploy.md](../../reference/deploy.md).
- Known gaps (both accepted trade-offs, not oversights): concurrent
  requests can each pass the count check before any of their inserts
  commit, so a client firing many requests in parallel can exceed the
  cap (the original design explicitly accepts this — "an attacker
  squeezing 6 instead of 5 emails changes nothing" — but unbounded
  concurrency was not separately modeled); and the extra DB
  read/write on the "issued" path versus the single read on the
  "rate-limited" or "not-found" paths is a residual timing side
  channel that a sufficiently patient attacker could use to infer
  when a target has been rate-limited. Both are candidates for
  hardening if abuse is observed in practice.

### Dev conveniences

When `ENVIRONMENT === "development"` (explicit opt-in, never inferred),
signup/login/email-change responses include `verify_url` so local dev
works without email delivery.

## Known limitations (→ roadmap)

- **No staff accounts or roles** — everyone shares the owner session.
  (Phase 5)
- **No notification to the old email address on email change** — a
  hijacked session could silently redirect future login links to an
  attacker's inbox with no signal to the legitimate owner. Deliberate
  v1 scope decision (proof of control of the *new* address is
  required; the old address is not). Hardening follow-up, tracked
  here — no roadmap phase assigned yet.
- **No session revocation UI** ("log out everywhere") and no sliding
  expiry (`last_used_at` is reserved but unused). (Phase 5)
- **`suspended` has no admin tooling** — the state exists but nothing can
  set it. (Phase 5)
