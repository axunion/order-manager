# Team & Scale (Staff Accounts, Lifecycle, Analytics, Realtime)

**Status:** design sketch — drafted 2026-07-11 (roadmap Phase 5, all items).
Lowest fidelity by intent: everything here sits behind Phases 2–4 and
its shape depends on how they land. Each numbered section becomes its
own proposal when its turn comes; this doc captures constraints so
earlier phases don't paint us into a corner.

## 1. Staff accounts & roles

Promoted to its own proposal, open decisions resolved with the user:
[staff-accounts-roles](staff-accounts-roles.md) — ready for
implementation.

## 2. Account lifecycle

- Tooling to set/unset `stores.status = 'suspended'` — the intended
  billing-enforcement hook. `requireStore` already rejects nothing for
  suspended stores today; that check gets added here (or earlier if a
  real abuse case appears).
- Account deletion with data export (JSON dump of the store's rows) —
  legally prudent before real merchants churn.

## 3. Analytics

- Item ranking, time-of-day/weekday sales, CSV export — server-side
  aggregation endpoints on top of Phase 2 sales data (that proposal
  deliberately kept aggregation client-side; the cutover point is when
  windows exceed a day or two).
- Consider a `paid_at`-indexed covering query first; only reach for
  materialized aggregates if D1 latency actually hurts.

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
