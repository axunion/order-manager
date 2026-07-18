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

Each menu item also carries `description`, `image_key` (both nullable),
and `option_groups` — only the groups attached to that item, each with
its options embedded (keeps the payload small; see
[menu-management.md](./menu-management.md#item-options--modifiers-apimenuoption-groups)
for how groups/options are managed). The order screen (`MenuList.tsx`)
renders a fixed-aspect photo thumbnail — sized independently of the
`<img>` load state, so it never causes layout shift — only when
`image_key` is present; items without one keep a compact card with no
reserved thumbnail space. Description text renders independently of
the photo. Photo `alt` text carries the item name (the description
doesn't describe what the dish looks like, so an empty `alt` would
drop that information for screen reader users). See
[menu-management.md](./menu-management.md#item-photos-apimenuitemsidimage-apimenuimageskey)
for how `image_key` resolves to a servable URL.

An item with no attached option groups keeps the one-tap add button
(`MenuList.tsx`); an item with one or more groups instead opens an
item detail sheet (`ItemDetailSheet.tsx`) — a group with `max_select
=== 1` renders as radios (plus a "no selection" option when
`min_select === 0`), otherwise as checkboxes disabled once
`max_select` is reached — plus a quantity stepper and a free-text note
field (≤ 200 chars).

### Adding items (`POST /api/order/:seatToken/items`)

- Accepts 1..n items of `{ menu_item_id, quantity 1–99, option_ids?:
  string[], note?: string | null }`.
- The first submission lazily creates the order (`status = 'open'`,
  201); later submissions append to it (200). A partial unique index
  makes concurrent first-orders safe.
- All items are validated up front (exists in this store, available);
  any failure rejects the whole request so no orphaned orders are
  created. Unavailable item → 409 with the item name. Per item, every
  `option_id` must belong to a group attached to that `menu_item_id`;
  each attached group's selected count must be within
  `[min_select, max_select]`; `unit_price + Σ selected price_delta`
  must stay `> 0` — any violation is 400 `VALIDATION_ERROR` with a
  specific message, and (like the availability check) rejects the
  whole request.
- Once the order is `payment_requested`, adding items → 409.
- Item snapshots (name, unit price) are taken at insert time; per-item
  timestamp offsets keep a stable display order. Selected options are
  snapshotted the same way into `order_item_options`
  (`name_snapshot`, `group_name_snapshot`, `price_delta_snapshot`) —
  later edits to the live option never change a placed order's total.
  The line total shown everywhere is
  `(unit_price_snapshot + Σ price_delta_snapshot) × quantity`
  (`sumOrderItems`, `@order/core`).

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
- **No order-status feedback** — the customer cannot see
  ordered/served progress per item (data exists; UI/API choice).
  (Phase 3)
- **Japanese only.** (Backlog)
- **No paid-receipt view** — after checkout the customer has no record.
  (Phase 4, receipts)
