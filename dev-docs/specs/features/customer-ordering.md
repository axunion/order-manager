# Feature: Customer Ordering

The `apps/order` SPA, reached by scanning a seat QR code
(`/order/:qr_token`). Anonymous; the token in the URL path is the only
credential (`requireSeat` middleware).

## Current behavior

### Bootstrap (`GET /api/order/:seatToken`)

Returns seat name, the menu (categories + **available items only**), and
the active order with items and running total, or `order: null`. Invalid
tokens → 404 and the SPA shows a not-found page.

### Adding items (`POST /api/order/:seatToken/items`)

- Accepts 1..n items of `{ menu_item_id, quantity 1–99 }`.
- The first submission lazily creates the order (`status = 'open'`,
  201); later submissions append to it (200). A partial unique index
  makes concurrent first-orders safe.
- All items are validated up front (exists in this store, available);
  any failure rejects the whole request so no orphaned orders are
  created. Unavailable item → 409 with the item name.
- Once the order is `payment_requested`, adding items → 409.
- Item snapshots (name, unit price) are taken at insert time; per-item
  timestamp offsets keep a stable display order.

### Requesting the bill (`PATCH /api/order/:seatToken/request-payment`)

- Transitions `open → payment_requested`. Idempotent (repeat → 200).
- No active order → 409.
- After this, the customer's screen shows the locked bill; staff sees the
  order appear on the checkout screen.

### Session model

"One table visit = one order" — the order stays active across page
reloads and multiple diners at the same table (everyone scans the same
QR). The check clears when staff completes payment; the next scan starts
fresh.

## Known limitations (→ roadmap)

- **No cancellation** — a mistaken tap cannot be undone by anyone, not
  even staff. First thing a real restaurant hits. (Phase 2, top
  priority)
- **No undo for request-payment** — tapping the bill button locks the
  order; only completing payment unlocks the table. (Phase 2, part of
  cancellation work)
- **No staff call** — customers can only order; "water please" still
  needs shouting. (Phase 3)
- **No item notes** — "no onions" has no field. (Phase 3, with
  modifiers)
- **No order-status feedback** — the customer cannot see
  ordered/served progress per item (data exists; UI/API choice).
  (Phase 3)
- **Japanese only.** (Backlog)
- **No paid-receipt view** — after checkout the customer has no record.
  (Phase 4, receipts)
