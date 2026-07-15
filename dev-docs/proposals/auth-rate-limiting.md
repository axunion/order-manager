# Auth Rate Limiting

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 2, item 6; production-deploy gate)

Signup/login can currently be abused to burn the Resend email quota or
spam a victim's inbox. Two layers, split by what each is good at:

## Layer 1 — per-email throttle (in the Worker, D1-backed)

Cap Magic Link issuance per store using data we already have:
`magic_link_tokens.created_at`. Before issuing (login, signup-resend,
email-change), count tokens created for that `store_id` in the last hour;
if ≥ 5, **silently skip issuance**.

**Prerequisite — stop deleting superseded tokens.** `issueMagicLink`
(`apps/api/src/auth.ts`) currently **DELETEs** the previous unused token
on each issuance, so at most one unissued row survives per (store,
purpose) and the count above would never reach the cap. Change the
DELETE to an UPDATE setting `used_at = now()` (supersede). Consumed
tokens are already kept for audit; superseded ones get the same
treatment, and `verify` already rejects any token with `used_at` set, so
security is unchanged — but created-at rows now accumulate and the count
works.

- The response must stay the anti-enumeration 200 `{ sent: true }` — a
  429 would leak that the email is registered. Log
  `[auth] rate-limited magic link for store <id>` for observability.
- Constant `MAGIC_LINK_HOURLY_CAP = 5` in `@order/core` `domain/auth.ts`
  next to the TTLs.
- Signup (`POST /api/stores`) is inherently capped by the email UNIQUE
  constraint (one store per email); the resend path via login is what
  needs the cap.
- D1 count query is one indexed lookup
  (`idx_magic_link_tokens_store`) — no new infra, no race worth caring
  about (an attacker squeezing 6 instead of 5 emails changes nothing).

## Layer 2 — per-IP flood protection (Cloudflare WAF, not code)

Worker-side IP limiting needs shared state (D1 writes per request or the
beta Rate Limiting binding); the platform already does this better.
Configure zone-level WAF rate-limiting rules when setting up the
production domain:

- `POST /api/auth/login` and `POST /api/stores`: e.g. 10 req / 10 min
  per IP → block.

Add this as a step in `dev-docs/reference/deploy.md` (one-time setup)
when implementing — it is part of this item's definition of done, and it
gates public exposure of the API.

## Testing

- Worker tests: superseded token (re-request) fails at `verify` exactly
  like a consumed one; 6th login request within an hour issues no token
  (count D1 rows) yet still returns `{ sent: true }`; cap resets outside
  the window (insert aged tokens directly); email-change requests share
  the same cap (defer this case if store-settings hasn't shipped yet).
- WAF rules are config, not code — verified by the deploy checklist, not
  vitest.
