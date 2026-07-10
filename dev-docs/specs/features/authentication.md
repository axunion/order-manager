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

### Verification (`GET /api/auth/verify?token=`)

- Validates the token (unused + unexpired), marks it consumed (kept for
  audit), activates the store on first signup, creates a session
  (30-day TTL), sets the `session_token` HttpOnly cookie, and redirects
  to the admin SPA.
- Every failure mode returns the same `INVALID_TOKEN` 400.

### Session & logout

- `GET /api/auth/me` resolves the session for SPA bootstrapping (401 when
  invalid/expired). Admin routes are guarded by `requireStore`.
- `POST /api/auth/logout` deletes only the current session (other devices
  stay logged in), clears the cookie, redirects to the login page.
- Multiple concurrent sessions per store are allowed by design (shared
  staff devices).

### Dev conveniences

When `ENVIRONMENT === "development"` (explicit opt-in, never inferred),
signup/login responses include `verify_url` so local dev works without
email delivery.

## Known limitations (→ roadmap)

- **No staff accounts or roles** — everyone shares the owner session.
  (Phase 5)
- **No way to change the owner email or store name** — no
  update-store endpoint at all. (Phase 2)
- **No session revocation UI** ("log out everywhere") and no sliding
  expiry (`last_used_at` is reserved but unused). (Phase 5)
- **No rate limiting** on login/signup — an attacker can burn email quota
  or spam a victim inbox. (Phase 2, deploy-blocking)
- **`suspended` has no admin tooling** — the state exists but nothing can
  set it. (Phase 5)
