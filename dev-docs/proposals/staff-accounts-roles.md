# Staff Accounts & Roles

**Status:** ready for implementation — drafted 2026-07-20 (roadmap Phase 5,
item 1). Promoted from `team-and-scale.md § 1` after resolving open
decisions with the user (invite flow, `stores.email` fate, logout-everywhere
scope, sliding session expiry — see each section below).

Today one email = one store = the only login identity (`stores.email`).
This introduces a `members` table so more than one person can log in to a
store, with two roles gating settings/menu/seat management vs. daily
board/checkout operations.

No pilot has launched yet (no production D1 data exists — see
`roadmap.md` Engineering track), so this is a schema/behavior change, not
a production data migration. `pnpm db:reset` wiping local D1 is fine;
there is no backfill script.

## 1. Schema (`packages/db`)

New `members` table:

- `id`, `store_id` (FK `stores`, indexed), `email` (**UNIQUE**, globally —
  same constraint shape as today's `stores.email`; one email = one member,
  across all stores), `role: 'owner' | 'staff'` (CHECK, default `'staff'`),
  `status: 'pending' | 'active'` (CHECK, default `'pending'` — mirrors
  `stores.status`'s pending/active pair, no `suspended` at member level;
  that stays store-level, Phase 5 item 2), `activated_at` (nullable),
  `created_at`.
- Index `idx_members_store` on `store_id` (tenant-isolation convention).

`sessions` gains `member_id` (FK `members`, NOT NULL). `store_id` stays on
`sessions` too (not derived via join) — every `requireStore`-guarded
request reads it, and joining through `members` on every request is
avoidable cost for no benefit.

`magic_link_tokens` gains `member_id` (FK `members`, **NOT NULL** — every
issuance path, including fresh-store `signup`, creates the `members` row
first, see §2, so a token always has one) and `purpose` gains `'invite'`.

**Why `member_id` replaces `store_id` as the dedup key:**
`issueMagicLink`'s supersede-previous-token query is currently scoped to
`store_id + purpose`. Once a store can have multiple members, two members
of the same store requesting `login` concurrently (or an owner inviting
two pending staff at once) would each invalidate the other's still-valid
token under the old store-scoped dedup. `issueMagicLink` takes `memberId`
instead of `storeId`; supersede and the hourly cap are scoped to
`member_id + purpose`. `store_id` stays on the table (denormalized,
tenant-isolation convention) but no longer participates in the dedup
query.

## 2. Auth flow rework (`apps/api/src/auth.ts`, `routes/auth.ts`, `routes/stores.ts`)

**Store signup (`POST /api/stores`)** — in the same insert step, also
create a `members` row: `role: 'owner'`, `status: 'pending'`, same email.
Conflict check extends to `members.email` (both UNIQUE constraints can
fire; diagnose the same way the slug/email race is diagnosed today).
`issueMagicLink(db, memberId, "signup")`.

**Verify (`GET /api/auth/verify`)** — token lookup now also returns
`member_id`. On `purpose === "signup"`: activate **both** the store and
the member (`status: 'active', activated_at`). On `purpose === "invite"`:
activate the member only (the store is already active — an owner can only
invite from an active store). Session insert sets `member_id` (looked up
from the token row) alongside the existing `store_id`.

**Login (`POST /api/auth/login`)** — lookup moves from
`stores.email` to `members.email`. Resolve the owning store via
`member.store_id` to check `store.status` (unchanged: `suspended` →
silent). Purpose for a non-active member: `role === 'owner' ? "signup" :
"invite"` (both existing purposes' resend semantics apply unchanged —
this is just deriving which one instead of always `"signup"`).

**Email change (`POST /api/stores/me/email-change`)** — re-targeted to
change the **calling member's own email**, not `stores.email`. Any active
member (owner or staff) can change their own login email; no
`requireOwner` gate. Conflict check moves to `members.email`.
`stores.email` is no longer editable by this endpoint (or any endpoint) —
it stays fixed at whatever address created the store, now purely
historical/display. Noting this explicitly since it's a visible behavior
change: `GET /api/auth/me`'s `email` field switches from `stores.email` to
the calling member's own email (the field users actually think of as "my
login email"); if a "store contact email" separate from any one member's
login is ever wanted, that's a new field, not `stores.email` reused.

**`GET /api/auth/me`** — response gains `role`; `email` now comes from
`members` (the caller's own row) instead of `stores`.

## 3. Role enforcement (`apps/api/src/middleware.ts`)

`StoreSession` (`@order/core` `domain/auth.ts`) gains `member_id: string`
and `role: 'owner' | 'staff'`. `getStoreBySession` joins
`sessions → members → stores` to populate them.

New `requireOwner` middleware, applied **after** `requireStore`: checks
`c.var.store.role === "owner"`, else `errorResponse("FORBIDDEN", ...,
403)`. Router-wide `.use(requireOwner)` (after `.use(requireStore)`) on:
`menu.ts`, `menu-options.ts`, `seats.ts`, and the new `staff.ts` router
(§4). `stores.ts`'s `/me` (rename) also gets `requireOwner` inline;
`/me/email-change` does not (any active member manages their own email).
`admin-orders.ts`, `staff-calls.ts`, `payments.ts` are unchanged — both
roles operate the board/checkout.

## 4. Staff management API (new `apps/api/src/routes/staff.ts`, mounted at `/api/staff`)

All routes `requireStore` + `requireOwner`.

- `POST /api/staff` — body `{ email, role }` (`role` defaults `'staff'`
  if omitted). Creates a `pending` member under the caller's `store_id`,
  issues `issueMagicLink(db, storeId, memberId, "invite")`, sends the
  invite email (new `purpose: "invite"` branch in `buildEmailContent`,
  `packages/core/src/domain/email.ts`). 400 if the email already belongs
  to any member (global uniqueness, same posture as store signup) —
  caller is authenticated/owner here, so anti-enumeration doesn't apply
  (same reasoning as `/me/email-change` today). Rate-limited to
  `MAGIC_LINK_HOURLY_CAP` invites per **store** per rolling hour: each
  invite creates a brand-new member, so `issueMagicLink`'s own
  member-scoped cap has no prior history to count and can never trigger
  on this path — without a separate store-scoped check here, an owner
  session could mint unlimited invite emails.
- `GET /api/staff` — list the store's members: `id, email, role, status,
  created_at, activated_at`. Scoped to `store_id` (tenant isolation).
- `DELETE /api/staff/:id` — revokes access: deletes the member row and
  cascade-deletes their sessions and magic_link_tokens (in the same
  `db.batch`). Rejects 400 if `id === caller's own member_id` (use
  logout, not self-removal) **and** if the target is the store's last
  remaining owner (count other `role: 'owner'` members in the store,
  excluding the target). Both checks are needed: self-removal alone
  doesn't prevent two distinct owner sessions from concurrently removing
  each other, which would leave zero owners despite each individual
  request passing the self-removal check. This is a check-then-act
  guard, not a transactional one (D1 has no cross-statement locking here)
  — same accepted tradeoff as the slug/email uniqueness checks
  elsewhere in this codebase (e.g. `POST /api/stores`'s slug race
  comment).

## 5. Logout-everywhere & sliding expiry

`POST /api/auth/logout-all` (`requireStore`) — deletes every session row
with `member_id === caller's member_id` (own devices only, not other
members' — confirmed scope), clears the cookie, redirects to login. Same
shape as `POST /api/auth/logout` otherwise.

Sliding expiry in `requireStore`: after a session resolves successfully,
if `last_used_at` is `null` or more than 1 hour old, update both
`last_used_at = now()` and `expires_at = now() + SESSION_TTL_MS` in the
same request (throttled to once/hour so 5s-polling admin/order-board
traffic doesn't write on every request). A session becomes durably
"logged out only by explicit action or 30 days of total inactivity."

## 6. Frontend (`apps/admin`)

- `StoreSettings.tsx` — email-change section now reads "change my email"
  (not "store email"); the displayed email is `useStoreInfo().email`,
  unchanged wiring since it already reads from `GET /api/auth/me`, whose
  `email` field now points at the member.
- New Staff page (owner-only nav item, hidden via `role` from
  `useStoreInfo()`): list members with role/status, invite form
  (email + role select), remove button per row (disabled on self and on
  the last owner — mirror the API's 400s so the button doesn't even
  fire the doomed request; **the API check is the actual guard**, this
  is UX only).
- Add "Log out everywhere" button (Settings page) calling
  `POST /api/auth/logout-all`.
- `AdminGuard`/`useStoreInfo` — extend the resolved session type with
  `role`; other admin pages/components are unaffected (their
  `requireStore`-gated data doesn't change shape).

## Testing

- Worker tests (`apps/api`):
  - Signup creates both a `stores` row and a `members` row
    (`role: 'owner', status: 'pending'`); verify activates both.
  - Invite (`POST /api/staff`) as owner creates a `pending` staff member
    and issues an `invite`-purpose token; verifying it activates the
    member and creates a session with the right `member_id`/`role`.
  - Two concurrent pending tokens for the same store (owner's own resend
    + a staff invite, or two staff invites) don't invalidate each other
    (member-scoped supersede, not store-scoped).
  - Login resolves by `members.email`; a `pending` staff member's login
    attempt resends the `invite` purpose (not `signup`).
  - `requireOwner`-gated routes (`menu`, `menu-options`, `seats`,
    `staff`, `PATCH /stores/me`) 403 for a `staff`-role session; 200 for
    `owner`. Board/checkout routes (`admin-orders`, `staff-calls`,
    `payments`) 200 for both roles.
  - `POST /api/staff` rejects an email already used by any member
    (cross-store included) and enforces the per-store hourly invite cap;
    `DELETE /api/staff/:id` rejects self-removal; a co-owner can still be
    removed, leaving one owner. The last-owner count check exists as
    concurrent-race protection (two owner sessions removing each other at
    once) — under sequential execution it's provably unreachable with
    `target != caller` (the caller always survives as an owner), so no
    dedicated test claims to reproduce the race; the check is defense in
    depth, verified by code review, not by a (necessarily flaky)
    concurrency test.
  - `POST /api/stores/me/email-change` changes the caller's own
    `members.email` (not `stores.email`); a second member's session
    still resolves under their own unchanged email.
  - `POST /api/auth/logout-all` deletes all of the caller's own sessions
    but leaves another member's sessions (same store) intact.
  - Sliding expiry: a request updates `expires_at`/`last_used_at` when
    `last_used_at` is `null` or stale (>1h); a second request inside the
    1h window does not re-write (assert via unchanged `last_used_at`).
  - Tenant isolation: Store A owner cannot see/invite/remove Store B's
    members via `/api/staff`.
- Frontend (`apps/admin`, vitest + happy-dom): Staff page renders
  role-gated nav only for `role: 'owner'`; invite form submit + list
  refresh; remove button disabled for self/last-owner rows.

## Interactions to respect

- The tenant-isolation and response-shape conventions in
  `.claude/rules/api-routes.md` apply to the new `staff.ts` router
  unchanged.
- `requireSeat`/customer-facing order API is untouched — this item is
  admin-side only.
