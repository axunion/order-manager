# Feature: Customer Ordering

The `apps/order` SPA, reached by scanning a seat QR code
(`/order/:qr_token`). Anonymous; the token in the URL path is the only
credential (`requireSeat` middleware).

## Current behavior

### Bootstrap (`GET /api/order/:seatToken`)

Returns seat name, the menu (categories + **available items only**), and
the active order with items and running total, or `order: null`. Invalid
tokens → 404 and the SPA shows a not-found page. Voided items stay in the
returned `items` array with `status: 'cancelled'` (for a strikethrough
display) rather than disappearing; the order `total` already excludes
them.

Each menu item also carries `description` and `image_key` (both
nullable). The order screen (`MenuList.tsx`) renders a fixed-aspect
photo thumbnail — sized independently of the `<img>` load state, so it
never causes layout shift — only when `image_key` is present; items
without one keep a compact card with no reserved thumbnail space.
Description text renders independently of the photo. Photo `alt` text
carries the item name (the description doesn't describe what the dish
looks like, so an empty `alt` would drop that information for screen
reader users). See
[menu-management.md](./menu-management.md#item-photos-apimenuitemsidimage-apimenuimageskey)
for how `image_key` resolves to a servable URL.

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

- **No customer self-cancel** — once an order reaches the kitchen,
  voiding an item or the whole order is staff-mediated only
  (`dev-docs/specs/features/order-fulfillment.md`); a "call staff"
  button is the intended UX for customer-initiated corrections.
  (Deliberate v1 decision — revisit with pilot feedback)
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
