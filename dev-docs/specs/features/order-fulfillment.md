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

### Un-serving (`PATCH /api/admin/orders/items/:id/unserve`)

- Reverts a mis-tapped `served` item back to `ordered`. Idempotent if
  already `ordered`. 409 if the item is `cancelled`, or if the parent
  order is not active (not `open` or `payment_requested`).

### Voiding an item (`PATCH /api/admin/orders/items/:id/cancel`)

- Transitions `ordered | served → cancelled`. Idempotent if already
  `cancelled`. 409 if the parent order is `paid` or `cancelled` — once an
  order is settled or void, its items are frozen. Voided items stay on
  the order (customer sees a strikethrough line); every total excludes
  them via `sumOrderItems`.

### Cancelling a whole order (`PATCH /api/admin/orders/:id/cancel`)

- Transitions `open | payment_requested → cancelled`, cascading to every
  non-`cancelled` item on the order in one `db.batch`. Idempotent if
  already `cancelled`. 409 if `paid`. Frees the seat for a new order,
  same as `paid` does.

All four endpoints are single-row-scoped with `store_id` filters;
cross-tenant ids → 404 (not 403).

### New-order alerts (client-side only, no API change)

The board diffs each poll against a watermark (the max
`order_items.created_at` seen so far, items not orders — appended items
to an existing order alert too). Any item newer than the watermark
triggers the alert and advances it; the initial load sets the watermark
silently. The `?since=` param above stays unused for this — full-list
diffing is simpler at this scale.

- **Visual (always on):** the affected order card gets a highlight ring
  for ~10s (a second alert on the same order restarts the window rather
  than clearing it early); `document.title` gains a `(N)` count of
  `ordered`-status items so a backgrounded tab still shows activity.
- **Sound (opt-in):** a Web Audio oscillator beep, toggled in the board
  header and persisted to `localStorage` (`order-alert-sound`) — sound
  is blocked by browsers before a user gesture, so the first toggle-on
  click doubles as the unlock.

## Known limitations (→ roadmap)

- **Polling, not push** — 5s latency and wasted requests; fine at
  current scale. Durable Objects/SSE is a deliberate later optimization.
  (Phase 5)
- **No kitchen/floor split or KDS mode** — one board for everything.
  (Backlog)
- **No prep-time or aging indicators** — orders don't visually escalate
  as they wait. (Phase 3)
