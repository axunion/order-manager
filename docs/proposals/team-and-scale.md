# Realtime Push & Platform Admin (Deferred)

**Status:** backlog — the shipped Phase 5 items originally covered by
this doc (staff accounts & roles, account lifecycle, analytics) are
documented in
[specs/features/authentication.md](../specs/features/authentication.md),
[specs/features/checkout.md](../specs/features/checkout.md), and
[specs/domain-model.md](../specs/domain-model.md). Only the two sketches
below remain; revisit each on a concrete demand signal — see
[roadmap.md](../roadmap.md) Backlog.

## Realtime push

- Replace 5 s polling (order board, staff calls, customer progress) only
  if pilot feedback shows latency or Worker-request cost hurting.
- Candidate: a per-store Durable Object fanning out SSE/WebSocket
  events, with polling kept as the degraded fallback. The Phase 2 alert
  watermark logic is transport-agnostic by design — reuse it as the
  event consumer.

## Platform admin

- A minimal internal view (store list, status, last activity) once
  store count makes SQL-by-hand impractical. Authentication for it is an
  open question (separate Worker behind Cloudflare Access is the
  likely cheap answer) — decide when it exists.
