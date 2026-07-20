# Account Lifecycle (Suspend/Reactivate, Delete + Export)

**Status:** ready for implementation — drafted 2026-07-20 (roadmap Phase 5,
item 2). Promoted from `team-and-scale.md § 2` after resolving open
decisions with the user.

**Scope decision:** this project has no billing integration and no
platform-admin auth (Phase 5 item 5, not built). The roadmap's "intended
billing-enforcement hook" framing for `suspended` assumed an external
actor (billing system, platform operator) that doesn't exist yet. This
item ships **owner self-service pause only** — a store owner can suspend
and reactivate their own store. Billing-triggered suspension is deferred
until there's an actual billing system to trigger it.

**Deletion data handling:** hard delete. All store-scoped rows
(including `orders`/`payments`) are deleted, not soft-deleted or
retained — no accounting/audit retention requirement exists for this
project (no real merchants have real historical data yet; see
`roadmap.md`'s pilot-not-launched note). Revisit if a real pilot's
accounting needs surface this as a requirement later.

## 1. Suspend / reactivate (`apps/api/src/routes/stores.ts`)

- `POST /api/stores/me/suspend` (`requireStore`, `requireOwner`) — sets
  `stores.status = 'suspended'`. Takes effect immediately: the request
  itself succeeds (status was still `active` when `requireStore` admitted
  it), but every subsequent request — including from the same session —
  is rejected by `requireStore`'s existing `status !== "active"` check.
  No body.

- **Reactivation must not require an already-valid session** (there
  isn't one — see above), so it reuses the existing per-email login
  surface instead of a new authenticated endpoint:
  `POST /api/auth/login` — today, a `suspended` store's login attempt is
  silently ignored (no email sent, matching the anti-enumeration
  contract). This changes to: if the resolved member's `role === 'owner'`
  **and** the store is `suspended`, issue a Magic Link with a new
  `purpose: 'reactivate'` instead of staying silent. A `staff`-role
  member's login attempt on a suspended store stays silently ignored —
  only an owner can reactivate. This is safe to carve out because
  reactivation doesn't bypass any billing/compliance gate (there is
  none); it just flips a boolean the owner themselves set, proven via
  the same Magic Link control-of-email check every other purpose uses.

- `GET /api/auth/verify` — new `purpose: 'reactivate'` branch: sets
  `stores.status = 'active'` (member is already active — suspension
  doesn't touch member rows), then continues through the normal
  session-creation and redirect steps.

- `magic_link_tokens.purpose` gains `'reactivate'` (schema change,
  `packages/db`). Shares the existing per-member `MAGIC_LINK_HOURLY_CAP`
  — no separate cap needed (unlike invite, reactivate doesn't mint new
  members, so the existing member-scoped cap already bounds it).

- Frontend (`apps/admin` SettingsPage, owner-only "danger zone" section):
  a "一時停止" button (`ConfirmDialog`) calling `POST /api/stores/me/suspend`,
  then a hard `window.location.href` redirect to `/login` (same reasoning
  as the existing logout-all button — the session is about to stop
  working anyway). The login page's existing "check your email" flow
  handles reactivation with no new UI needed — the owner just logs in
  again.

## 2. Delete + export (`apps/api/src/routes/stores.ts`)

- `DELETE /api/stores/me` (`requireStore`, `requireOwner`) — body
  `{ confirm_name: string }`, must exactly match the store's current
  `name` (400 `VALIDATION_ERROR` otherwise) as a server-side safeguard
  against an accidental or scripted request, independent of whatever
  client-side confirmation UI exists.
- On match: reads every store-scoped row (see table list below) to build
  a JSON export, then deletes all of them plus the `stores` row itself in
  one `db.batch`, in FK-dependency order (children before parents):
  `order_item_options`, `order_items`, `payments`, `staff_calls`,
  `orders`, `seats`, `menu_item_option_groups`, `options`, `menu_items`,
  `menu_categories`, `option_groups`, `magic_link_tokens`, `sessions`,
  `members`, `stores`. (`menu_item_option_groups` has no `store_id`
  column — deleted by the already-fetched `menu_items`/`option_groups`
  ids from this store, via `inArray`.)
- Response: `200 { data: { export: {...} } }` — the export **is** the
  response body (not a separate endpoint), so it's produced atomically
  with the delete and the frontend can offer it as a download in the
  same action. Export shape: one key per table
  (`store`, `members`, `menu_categories`, `menu_items`, `option_groups`,
  `options`, `menu_item_option_groups`, `seats`, `orders`, `order_items`,
  `order_item_options`, `staff_calls`, `payments`), each an array of
  plain rows. `sessions`/`magic_link_tokens` are excluded — auth
  artifacts containing secrets (tokens), not business data.
- After this call, the session cookie is stale (store no longer exists);
  the frontend clears it client-side (no server round-trip needed — the
  row is already gone) and redirects to signup.
- Frontend: a second danger-zone control — a `Field` where the owner
  types the store's exact name, with the "アカウントを削除" `ConfirmDialog`
  trigger disabled until the typed value matches (mirrors
  `StaffManager`'s self/last-owner disable pattern: client-side
  convenience, the server's `confirm_name` check is the real guard). On
  confirm, downloads the response's `export` as a JSON file
  (`Blob` + `URL.createObjectURL` + a clicked `<a download>`, no existing
  precedent in this codebase to reuse) before redirecting.

## Testing

- Worker tests (`apps/api`):
  - `POST /api/stores/me/suspend`: 403 for staff role; sets
    `stores.status = 'suspended'`; the same session's next request
    (e.g. `GET /api/seats`) then 401s.
  - `POST /api/auth/login` on a suspended store: an owner-role member
    issues a `reactivate`-purpose token (assert via `magic_link_tokens`
    row); a staff-role member on the same suspended store still gets no
    token (silent, matching current behavior).
  - `GET /api/auth/verify` on a `reactivate` token: sets
    `stores.status = 'active'`, creates a session, 302 redirects — and a
    second request through `requireStore` with the new session succeeds.
  - `DELETE /api/stores/me`: 403 for staff role; 400 when
    `confirm_name` doesn't match; on match, deletes the store and every
    row across all 13 business tables (seed one row in each, assert all
    gone); the response's `export` contains the pre-deletion data for
    each table; a second store's data is untouched (tenant isolation).
  - Rate limiting: `reactivate` issuance shares the per-member hourly cap
    (reuse the existing `auth-rate-limiting.test.ts` pattern with
    `purpose: 'reactivate'`).
- Frontend (`apps/admin`, vitest + happy-dom): suspend button calls the
  endpoint and redirects; delete button stays disabled until the typed
  name matches the store name, then calls the endpoint and triggers a
  download.

## Interactions to respect

- `requireStore`'s existing `status !== "active"` check is reused
  as-is for suspension enforcement — no new middleware.
- The tenant-isolation and response-shape conventions in
  `.claude/rules/api-routes.md` apply to both new endpoints.
- This item does not touch `members.status`, roles, or any Phase 5 item 1
  behavior — suspension/deletion operate at the `stores` row level only.
