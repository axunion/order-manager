# Feature: Authentication & Account

Passwordless Magic Link auth. Technical architecture (cookie strategy,
cross-origin design) lives in [reference/auth.md](../../reference/auth.md);
this spec covers product behavior.

## Actors

- **Member** — a login identity on a store (`members` table). Two roles:
  - **Owner** — full access: settings, menu, seats, staff management, plus
    board/checkout.
  - **Staff** — daily operations only: board/checkout (order board, staff
    calls, payments). Cannot manage menu/seats/settings/staff.
- A store's first member (created at signup) is always an owner. A store
  always has at least one owner — see "Staff management" below.

## Current behavior

### Sign-up (`POST /api/stores`, from `apps/signup`)

1. Owner submits store name + email. A URL slug is derived from the name
   with a 5-char random suffix.
2. Store is created with `status = 'pending'`, and its first member is
   created in the same step (`role: 'owner'`, `status: 'pending'`, same
   email). A signup Magic Link (15 min TTL, single-use) is emailed via
   Resend.
3. Duplicate email → 400 with an explicit "already registered" message
   (checked against both `stores.email` and `members.email` — either can
   independently already hold the address). Failure to issue the token
   compensates by deleting the store + member rows so the owner can retry.
4. Email delivery failure leaves the store `pending`; the owner recovers
   via the login form (which resends the signup link).

### Login (`POST /api/auth/login`, form hosted in `apps/admin`)

- Resolves by **`members.email`**, not `stores.email` — `stores.email` is
  fixed at whatever address created the store and is no longer a login
  identity (see "Store settings" below).
- Always returns 200 with an identical body regardless of whether the
  email exists (anti-enumeration). Email delivery is deferred via
  `waitUntil` so response latency doesn't leak registration status either.
- Per member/store status: member `active` (and store `active`) → login
  link. Member `pending`: resends the `signup` Magic Link if the member is
  an `owner` (first-time onboarding), or the `invite` Magic Link if
  `staff` (unactivated invite). Store `suspended` → silently no email.
- Rate limited per member: see "Magic Link issuance cap" below.

### Verification (`GET /api/auth/verify?token=`)

- Validates the token (unused + unexpired), marks it consumed (kept for
  audit), creates a session (30-day TTL, sliding — see below), sets the
  `session_token` HttpOnly cookie, and redirects to the admin SPA.
- `purpose = 'signup'`: activates both the store and the member.
- `purpose = 'invite'`: activates the member only (the inviting store is
  already active).
- Every failure mode returns the same `INVALID_TOKEN` 400.

### Session & logout

- `GET /api/auth/me` resolves the session for SPA bootstrapping — returns
  `{ id, name, email, role }` (401 when invalid/expired). `id`/`name` are
  the store's; `email` is the **calling member's own** login email; `role`
  is `'owner'` or `'staff'`. Admin routes are guarded by `requireStore`,
  which additionally rejects (401) if the member itself isn't `active`
  (e.g. a removed or not-yet-verified member) even if the store is.
- `POST /api/auth/logout` deletes only the current session (other devices
  stay logged in), clears the cookie, redirects to the login page.
- `POST /api/auth/logout-all` (`requireStore`) deletes **every** session
  belonging to the calling member — all of that member's own devices —
  and clears the cookie. Does not affect other members' sessions.
- Multiple concurrent sessions per member are allowed by design (e.g. a
  phone and a register terminal).
- **Sliding expiry:** each authenticated request refreshes the session's
  `expires_at` to 30 days out and updates `last_used_at`, throttled to at
  most once per hour of activity (so 5s-polling admin/order-board traffic
  doesn't write on every request). A session is durably logged out only
  by explicit action (`logout`, `logout-all`, or being removed via staff
  management) or 30 days of total inactivity — not a fixed clock from
  issuance.

### Roles & route gating

- **Owner-gated** (`requireOwner`, 403 for a `staff`-role session):
  `PATCH /api/stores/me` (rename), all of `menu`/`menu-options`/`seats`,
  and all of staff management (below).
- **Open to both roles:** the order board, staff calls, payments/checkout,
  and `POST /api/stores/me/email-change` (any active member manages their
  own login email; gated by "is this your own account", not role).

### Staff management (`apps/api/src/routes/staff.ts`, owner-only)

- `POST /api/staff` — invites a member into the caller's store: body
  `{ email, role }` (`role` defaults `'staff'`; an owner can also invite a
  co-owner). Creates a `pending` member and sends an `invite` Magic Link.
  400 if the email already belongs to any member (global uniqueness — the
  caller is authenticated/owner here, so anti-enumeration doesn't apply).
  Rate-limited to `MAGIC_LINK_HOURLY_CAP` invites per **store** per
  rolling hour (the per-member Magic Link cap can't apply here — each
  invite is a brand-new member with no prior history).
- `GET /api/staff` — lists the calling store's members (`id, email, role,
  status, created_at, activated_at`).
- `DELETE /api/staff/:id` — revokes a member's access: deletes the member
  row and cascades their sessions and magic-link tokens. Rejects 400 for
  self-removal (use logout instead) and for removing the store's last
  remaining owner (a co-owner can still be removed, leaving one owner) —
  a store always keeps at least one owner.
- Managed from `apps/admin`'s Staff page (owner-only nav item): invite
  form, member list with role/status, remove button (disabled client-side
  for self and the sole remaining owner — the API check above is the
  actual guard, this is UX only).

### Store settings — rename & email change (`apps/admin` SettingsPage)

- `PATCH /api/stores/me` (`requireStore`, `requireOwner`) updates the
  store's display name only; the slug is never regenerated (a stable
  identifier, not currently used by any feature).
- `POST /api/stores/me/email-change` (`requireStore`) changes the
  **calling member's own** login email — not `stores.email`. Any active
  member (owner or staff) can change their own email. Issues a Magic Link
  with `purpose = 'email_change'` to the **new** address, proving control
  before the change applies. Rejects 400 if the address equals the
  current one or is already registered to another member — the caller is
  authenticated here, so anti-enumeration doesn't apply (unlike
  `/api/auth/login`).
- `GET /api/auth/verify` applies the pending address to `members.email`
  on `email_change` token verification, right after marking the token
  consumed and before session creation. A UNIQUE-constraint race — the
  address claimed by another member after the token was issued — fails
  generically as `INVALID_TOKEN`, same as any other invalid token.
- `stores.email` itself has no edit path — it stays fixed at whatever
  address created the store, now purely historical/display. If a "store
  contact email" distinct from any member's login email is ever needed,
  that's a new field, not `stores.email` reused.
- `magic_link_tokens.purpose` includes `'email_change'` (and `'invite'`,
  above); a nullable `new_email` column holds the pending target address
  for `email_change` tokens only (see [domain-model.md](../domain-model.md)).

### Magic Link issuance cap (rate limiting)

- `issueMagicLink` (`apps/api/src/auth.ts`) refuses to issue a token —
  returning `null` instead — once a **member** has reached
  `MAGIC_LINK_HOURLY_CAP` (5, `@order/core` `domain/auth.ts`) issuances
  in the last rolling hour, across signup-resend, login, email-change,
  and invite combined. Scoped per member (not per store): a store can
  have multiple members now, and two members issuing unrelated tokens
  (concurrent logins, or two simultaneous staff invites) must not
  invalidate each other's link. Callers (`POST /api/auth/login`,
  `POST /api/stores/me/email-change`) skip sending on `null` but return
  the exact same response as success — the anti-enumeration contract
  must not change shape when a member is rate-limited.
  `POST /api/stores` (initial signup) treats `null` as an issuance
  failure (compensating store+member row delete, 500) since a brand-new
  `member_id` can never realistically hit the cap. `POST /api/staff`
  (invite) has its own separate store-scoped cap — see "Staff management"
  above.
- Superseding the previous unused token for a member+purpose (so only
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
signup/login/email-change/invite responses include `verify_url` so local
dev works without email delivery.

## Known limitations (→ roadmap)

- **No notification to the old email address on email change** — a
  hijacked session could silently redirect future login links to an
  attacker's inbox with no signal to the legitimate member. Deliberate
  v1 scope decision (proof of control of the *new* address is
  required; the old address is not). Hardening follow-up, tracked
  here — no roadmap phase assigned yet.
- **`suspended` has no admin tooling** — the state exists but nothing can
  set it. (Phase 5)
