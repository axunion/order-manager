# Feature: Order Fulfillment (Order Board)

The admin OrdersPage / OrderBoard: the kitchen/floor view of active
orders. Requires the `session_token` cookie (`requireStore`).

## Current behavior

### Board (`GET /api/admin/orders`)

- Returns all `open` and `payment_requested` orders with seat name, line
  items, and total, oldest first. Each line item includes its selected
  options (name + signed price delta) and free-text note, if any —
  OrderBoard renders both under the item name so the kitchen sees them
  without opening anything.
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

### Staff calls (`/api/admin/calls`)

- `GET /` — lists calls, oldest first, joined with seat name. Defaults
  to `?status=open`; `?status=all` includes resolved calls (history).
  Polled every 5 seconds, same cadence as the order board, into a
  banner strip above the order list (seat name, elapsed time, a
  "対応済み" resolve button).
- `PATCH /:id/resolve` — idempotent; sets `resolved_at`. `store_id`
  filtered; cross-tenant/unknown ids → 404.
- Customers create calls from the order screen — see
  [customer-ordering.md](./customer-ordering.md#calling-staff-post-apiorderseattokencall).

### New-order and new-call alerts (client-side only, no API change)

Both the order board and the call banner share the same alert
mechanism (`apps/admin/src/lib/orderAlerts.ts`), each diffing its own
poll against its own watermark (orders: the max `order_items.created_at`
seen so far, items not orders — appended items to an existing order
alert too; calls: the max `staff_calls.created_at` among open calls).
Anything newer than the watermark triggers the alert and advances it;
the initial load of each sets its watermark silently. The `?since=`
param above stays unused for this — full-list diffing is simpler at
this scale.

- **Visual (always on):** the affected order card or call banner row
  gets a highlight ring for ~10s (a second alert on the same id
  restarts the window rather than clearing it early); `document.title`
  gains a `(N)` count of `ordered`-status items so a backgrounded tab
  still shows activity.
- **Sound (opt-in):** a Web Audio oscillator beep, toggled in the board
  header and persisted to `localStorage` (`order-alert-sound`) — sound
  is blocked by browsers before a user gesture, so the first toggle-on
  click doubles as the unlock. New orders and new calls both trigger it.

## Known limitations (→ roadmap)

- **Polling, not push** — 5s latency and wasted requests; fine at
  current scale. Durable Objects/SSE is a deliberate later optimization.
  (Phase 5)
- **No kitchen/floor split or KDS mode** — one board for everything.
  (Backlog)
- **No prep-time or aging indicators** — orders don't visually escalate
  as they wait. (Phase 3)
