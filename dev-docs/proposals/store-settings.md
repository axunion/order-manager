# Store Settings (Name & Email Change)

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 2, item 4)

There is no way to edit a store after signup. Add a settings page with
store rename and owner email change (re-verified via Magic Link).

## API

### `PATCH /api/stores/me` (requireStore)

- Body: `{ name }` (same 1–100 char rule as signup). Updates
  `stores.name` only. The slug is **not** regenerated — it is a stable
  identifier (currently unused by any feature; note this in the spec when
  shipped). Response: updated `{ id, name, slug }`.
- Mount note: `storesRouter` is public; apply `requireStore` inline on
  this route (same pattern as `authRouter`'s `/me`), not router-wide.

### `POST /api/stores/me/email-change` (requireStore)

- Body: `{ new_email }` (Zod `z.email()`).
- Rejects 400 if `new_email` equals the current email or is already
  registered to another store (explicit message — the caller is
  authenticated, so anti-enumeration does not apply here).
- Issues a Magic Link token with `purpose = 'email_change'` and the
  target address stored on the token; **sends to the new address**
  (possession proof). Invalidate previous unused email-change tokens on
  re-request, mirroring `issueMagicLink`'s existing behavior.
- Always 200 `{ data: { sent: true } }` (+ `verify_url` in dev, same
  opt-in gate as login).

### `GET /api/auth/verify` (existing endpoint, new purpose)

- For `email_change` tokens: set `stores.email = token.new_email`, mark
  token used, create a session as usual, redirect to admin. If the new
  email was claimed by another store *after* the token was issued
  (UNIQUE race), fail with the generic `INVALID_TOKEN` 400.

## Schema

`magic_link_tokens`:
- `purpose` enum gains `'email_change'` (CHECK constraint update →
  table-rebuild migration, same caveat as order-cancellation).
- New nullable column `new_email` (set only for `email_change` tokens).

## Admin UI — SettingsPage

- New nav entry + route `/settings`.
- Store name form (inline save).
- Email section: shows current email; form for the new address; after
  submit, an "check your new inbox" notice. Session survives the change
  (sessions key on `store_id`, not email).

## Security notes

- Email change requires an active session **and** proof of control of
  the new inbox. Notification to the *old* address ("your email was
  changed") is a hardening follow-up — out of scope v1, tracked in the
  authentication spec's limitations when this ships.
- Rate limiting of email-change requests rides on
  [auth-rate-limiting.md](./auth-rate-limiting.md) (same per-store token
  issuance cap).

## Testing

- Worker tests: rename validation + tenant isolation; email-change happy
  path end-to-end (request → verify → login works only via new email);
  duplicate/unchanged email 400; UNIQUE race at verify → INVALID_TOKEN;
  old token invalidated by re-request.
- Frontend tests: settings forms, success/error states.
