# Feature: Order Fulfillment (Order Board)

The admin OrdersPage / OrderBoard: the kitchen/floor view of active
orders. Requires the `session_token` cookie (`requireStore`).

## Current behavior

### Board (`GET /api/admin/orders`)

- Returns all `open` and `payment_requested` orders with seat name, line
  items, and total, oldest first.
- Optional `?since=<unix_ms>` filters to orders created after the
  timestamp (currently unused by the UI; groundwork for incremental
  polling).
- The UI polls every 5 seconds (`setInterval` in OrderBoard).

### Serving (`PATCH /api/admin/orders/items/:id/serve`)

- Marks a single line item `served`. Idempotent; cross-tenant ids → 404.
- One-directional: there is no un-serve.

## Known limitations (→ roadmap)

- **No new-order alert** — the list refreshes silently; staff must watch
  the screen. (Phase 2)
- **No un-serve** — a mis-tap is unrecoverable. (Phase 2, trivial once
  cancellation lands)
- **No void from the board** — staff cannot remove a wrong item; couples
  with the cancellation design. (Phase 2)
- **Polling, not push** — 5s latency and wasted requests; fine at
  current scale. Durable Objects/SSE is a deliberate later optimization.
  (Phase 5)
- **No kitchen/floor split or KDS mode** — one board for everything.
  (Backlog)
- **No prep-time or aging indicators** — orders don't visually escalate
  as they wait. (Phase 3)
