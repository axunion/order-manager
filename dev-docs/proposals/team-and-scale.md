# Team & Scale (Staff Accounts, Lifecycle, Analytics, Realtime)

**Status:** design sketch — drafted 2026-07-11 (roadmap Phase 5, all items).
Lowest fidelity by intent: everything here sits behind Phases 2–4 and
its shape depends on how they land. Each numbered section becomes its
own proposal when its turn comes; this doc captures constraints so
earlier phases don't paint us into a corner.

## 1. Staff accounts & roles

**✅ Shipped.** See
[specs/features/authentication.md](../specs/features/authentication.md)
and [specs/domain-model.md](../specs/domain-model.md) (the `members`
table, roles, staff management API, logout-everywhere, sliding expiry).
Its design proposal (`staff-accounts-roles.md`) has been folded and
deleted per `dev-docs/README.md`.

## 2. Account lifecycle

**✅ Shipped.** See
[specs/features/authentication.md](../specs/features/authentication.md#account-lifecycle-appsadmin-settingspage-owner-only-danger-zone)
and [specs/domain-model.md](../specs/domain-model.md) (owner self-service
suspend/reactivate; hard-delete account deletion with JSON export). Its
design proposal (`account-lifecycle.md`) has been folded and deleted per
`dev-docs/README.md`.

## 3. Analytics

Promoted to its own proposal, open decisions resolved with the user:
[sales-reports](sales-reports.md) — ready for implementation.

## 4. Realtime push

- Replace 5 s polling (order board, staff calls, customer progress) only
  if pilot feedback shows latency or Worker-request cost hurting.
- Candidate: a per-store Durable Object fanning out SSE/WebSocket
  events, with polling kept as the degraded fallback. The Phase 2 alert
  watermark logic is transport-agnostic by design — reuse it as the
  event consumer.

## 5. Platform admin

- A minimal internal view (store list, status, last activity) once
  store count makes SQL-by-hand impractical. Authentication for it is an
  open question (separate Worker behind Cloudflare Access is the
  likely cheap answer) — decide when it exists.
