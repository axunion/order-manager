# Roadmap

Phased plan from the initial MVP to a production-ready product. **Phases
1–5 are shipped.** Shipped behavior is documented in `specs/` (source of
truth, kept current); per-item design history lives in git. What remains
is a demand-driven backlog plus a few engineering-track items.

Conventions:

- Backlog items keep a design sketch in `proposals/`. When one is picked
  up, promote its sketch to an implementation-ready proposal, then follow
  [reference/implementation-loop.md](reference/implementation-loop.md)
  (tests → implementation → review → commit, per slice) — invoked via
  the `/implement-item` skill.
- When an item ships: fold its proposal into the relevant spec, delete
  the proposal, and move the item to the Shipped section here (see
  `docs/README.md`).

## Status

| Phase | Theme | Status |
| --- | --- | --- |
| 1 | Core business cycle | ✅ Shipped |
| 2 | Operate a real day | ✅ Shipped |
| 3 | Customer experience | ✅ Shipped |
| 4 | Money: payments, receipts, adjustments | ✅ Shipped |
| 5 | Team, scale, and account lifecycle | ✅ Shipped |
| — | Shift management (second product) | ✅ Shipped (v1) |
| — | Engineering track (parallel) | Ongoing |

## Shipped (Phases 1–5)

One line per phase; the linked specs describe the full shipped behavior.

- **Phase 1 — Core business cycle:** menu management, seats & QR tokens,
  customer ordering, order board, checkout. →
  [product-overview](specs/product-overview.md), [specs/features/](specs/features/)
- **Phase 2 — Operate a real day:** order cancellation & correction,
  sales history & daily summary, new-order alerts, store settings, seat
  lifecycle fixes, auth rate limiting. →
  [order-fulfillment](specs/features/order-fulfillment.md),
  [checkout](specs/features/checkout.md),
  [authentication](specs/features/authentication.md),
  [seats-and-qr](specs/features/seats-and-qr.md)
- **Phase 3 — Customer experience:** item descriptions & photos (R2),
  options/modifiers, staff call, order progress for customers, order
  board aging indicators. →
  [menu-management](specs/features/menu-management.md),
  [customer-ordering](specs/features/customer-ordering.md)
- **Phase 4 — Money:** cashless payment methods, digital receipts with
  tax breakdown, whole-check discounts, payment void/refund with audit
  trail. → [checkout](specs/features/checkout.md),
  [domain-model](specs/domain-model.md)
- **Phase 5 — Team & account lifecycle:** staff accounts & roles
  (`members` table, per-member sessions, logout-everywhere), owner
  self-service suspend/reactivate and hard-delete with data export,
  sales analytics & CSV export. →
  [authentication](specs/features/authentication.md),
  [checkout](specs/features/checkout.md)
- **Shift management (v1)** — a second product for the same stores, sold
  independently through a `subscriptions` entitlement layer: availability
  collection → schedule building → publish, in the `apps/shift` SPA.
  Coverage, labour warnings and cost are computed from the shift rows,
  never stored. Post-publish changes (absence, swap, open shifts) are a
  v2 follow-up. →
  [shift-management](specs/features/shift-management.md),
  [domain-model](specs/domain-model.md)

## Backlog (demand-driven)

Revisit only on a concrete demand signal from a real store; each keeps a
design sketch in `proposals/`.

1. **Split billing** — multiple settled payments per order, split by
   amount. Sketch: [payments-expansion](proposals/payments-expansion.md).
2. **Real-time push** — replace 5s polling with SSE/Durable Objects if
   pilot feedback shows latency or request cost hurting. Sketch:
   [team-and-scale](proposals/team-and-scale.md).
3. **Platform admin** — minimal internal view of stores/health once
   store count makes SQL-by-hand impractical. Sketch:
   [team-and-scale](proposals/team-and-scale.md).
4. **Shift management v2** — post-publish changes: absence reporting,
   staff-to-staff swap with manager approval, and an open-shift board.
   Two more state machines and a notification channel; revisit once a
   store has run a published schedule for a few periods. Shipped v1
   behavior and its deliberate gaps:
   [shift-management](specs/features/shift-management.md).

## Engineering track (parallel, not a phase)

Remaining items, sequenced against product needs:

- **Production deployment** — the runbook is
  [reference/deploy.md](reference/deploy.md); the WAF per-IP rate-limit
  config is still a required manual step before public exposure.
- **CI deploy** — manual `wrangler deploy` is fine until the pilot;
  automate on `main` once deploys become routine.
- **Browser E2E in CI** — the suite is shipped as `apps/e2e`
  (`pnpm e2e`, [reference/browser-e2e.md](reference/browser-e2e.md));
  wiring it into CI is the remaining step, once it has a track record.
- **Observability** — Workers analytics/log tail is enough now; add
  error alerting before the pilot goes unattended.
- **Backups** — document the D1 time-travel/export procedure before
  real sales data exists (i.e., before the pilot).

## Explicitly not planned (non-goals)

See [product-overview.md](specs/product-overview.md): POS hardware,
reservations, inventory, multi-location, native apps, takeout/delivery.
Revisit only with concrete user demand.
