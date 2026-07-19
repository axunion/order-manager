# Domain Model

Source of truth: `packages/db/src/schema.ts`. This document explains the
*why* behind the schema and the rules that every feature must respect.

## Entity overview

```
stores 1 ──── * menu_categories 1 ──── * menu_items 1 ──── * menu_item_option_groups * ──── 1 option_groups 1 ──── * options
   │                                        │ (snapshot at order time)
   ├──── * seats 1 ──── * orders 1 ──── * order_items 1 ──── * order_item_options
   │        │               │
   │        └──── * staff_calls
   ├──── * sessions         └──── 0..1 payments
   └──── * magic_link_tokens
```

- **stores** — one row per tenant. Owner email doubles as the login id;
  changeable via store settings (see below), always re-verified via
  Magic Link before it takes effect.
- **menu_categories / menu_items** — the sellable catalog. Items may be
  uncategorized (`category_id` nullable). Prices are tax-inclusive JPY
  integers; `tax_rate` (8 or 10, default 10) is not exposed in the
  admin UI in v1 but exists so receipts stay correct if takeout or a
  rate change ever arrives. Items also carry a nullable `description`
  (≤ 500 chars) and a nullable `image_key` — an R2 object key, not a
  URL, so the serving origin can change without touching data (see
  [features/menu-management.md](./features/menu-management.md#item-photos-apimenuitemsidimage-apimenuimageskey)).
- **option_groups / options** — store-level, reusable across items (a
  "Size" group attaches to every drink; per-item groups would force
  duplication). A group has `min_select`/`max_select` (e.g. 1/1 = choose
  exactly one size, 0/3 = up to three toppings). An option carries a
  `price_delta` (int JPY, may be negative). `menu_item_option_groups`
  joins groups to items (see
  [features/menu-management.md](./features/menu-management.md#item-options--modifiers-apimenuoption-groups)).
- **seats** — physical tables. Each has an unguessable `qr_token` (UUID)
  that authenticates the customer order screen; `is_active` soft-deletes
  a retired seat (row and name survive forever for historical
  orders/sales) instead of a hard `DELETE`, which `orders.seat_id NOT
  NULL` would block anyway once the seat has any order history.
- **orders** — one "check" per table visit, not per submission. Items
  accumulate on the same order until it is paid.
- **order_items** — line items with `name_snapshot` /
  `unit_price_snapshot` / `tax_rate_snapshot` copied at order time, so
  later menu edits never change a bill. Also carries a nullable
  free-text `note` (≤ 200 chars, e.g. "no onions"). `order_item_options`
  snapshots each selected option (`name_snapshot`, `group_name_snapshot`,
  `price_delta_snapshot`) so editing or deleting the live option later
  never changes a past bill.
- **staff_calls** — a seat's "call staff" request, independent of
  `orders` (a table can call staff with no order yet). At most one
  `open` call per seat is enforced by a partial unique index; see
  [features/customer-ordering.md](./features/customer-ordering.md#calling-staff-post-apiorderseattokencall)
  and
  [features/order-fulfillment.md](./features/order-fulfillment.md#staff-calls-apiadmincalls).
- **payments** — at most one *settled* (non-voided) row per order
  (partial unique index on `order_id`, see invariant 3). Records
  `method` (`'cash' | 'card' | 'qr'`), an optional whole-check
  `discount_amount`/`discount_reason`, and — once voided —
  `voided_at`/`void_reason`. A voided row's order reopens to
  `payment_requested` and the row itself is kept (not deleted) for
  audit history; see
  [features/checkout.md](./features/checkout.md#voiding-a-payment-patch-apipaymentsidvoid).
- **sessions / magic_link_tokens** — auth artifacts; see
  [features/authentication.md](./features/authentication.md).
  `magic_link_tokens.purpose` is `'signup' | 'login' | 'email_change'`;
  the nullable `new_email` column holds the pending target address for
  `email_change` tokens only.

## State machines

### stores.status

```
pending ──(magic link verified)──▶ active ──(future: admin action)──▶ suspended
```

- `pending` — registered, email unverified. Login resends the signup link.
- `active` — normal operation.
- `suspended` — reserved for future account disabling (no tooling yet).
  Login requests are silently ignored.

### orders.status

```
open ──(customer requests payment)──▶ payment_requested ──(staff checkout)──▶ paid
  ▲                    │                                                        │
  └───(staff reopens)──┘                                                        │
                        ▲                                                       │
                        └──────────────────(staff voids the payment)────────────┘

open, payment_requested ──(staff cancels)──▶ cancelled
```

- `open` — items can be added by the customer.
- `payment_requested` — bill locked; adding items returns 409. Set by the
  customer; staff can send it back to `open` (`PATCH
  /api/admin/orders/:id/reopen`, idempotent if already `open`).
- `paid` — normally terminal (`closed_at` must be set, DB CHECK
  constraint) but reachable back to `payment_requested` if staff voids
  the payment (`closed_at` cleared) — see
  [features/checkout.md](./features/checkout.md#voiding-a-payment-patch-apipaymentsidvoid).
- `cancelled` — terminal (walkout, mistaken table). Reachable from `open`
  or `payment_requested` via `PATCH /api/admin/orders/:id/cancel`, never
  from `paid`. Sets `closed_at`; frees the seat like `paid` does (the
  one-active-order-per-seat partial index excludes it). Cancelling an
  order cascades to all its non-`cancelled` items in one `db.batch`.

### order_items.status

```
ordered ──(staff marks served)──▶ served
   │                                  │
   └──(staff voids)──▶ cancelled ◀────┘
```

- `ordered → served` and `served → ordered` (un-serve, `PATCH
  .../unserve`) are idempotent at the API level.
- `ordered | served → cancelled` (void, `PATCH .../cancel`) is terminal
  and idempotent; rejected (409) once the parent order is `paid` or
  `cancelled`. `sumOrderItems` excludes `cancelled` items from every
  total, so voiding a line never requires recomputation elsewhere.

### staff_calls.status

```
open ──(staff resolves)──▶ resolved
```

- `open → resolved` (`PATCH /api/admin/calls/:id/resolve`) is terminal
  and idempotent. `resolved_at` must be set once `resolved` (DB CHECK
  constraint, same pattern as `orders.closed_at`). A resolved call
  frees the seat for a fresh `open` call — the partial unique index
  only covers `status = 'open'`.

## Invariants (DB-enforced)

1. **One active order per seat** — partial unique index on
   `orders.seat_id WHERE status IN ('open','payment_requested')`. Handles
   concurrent Workers racing to create the first order.
2. **One open call per seat** — partial unique index on
   `staff_calls.seat_id WHERE status = 'open'`, same pattern as
   invariant 1. Concurrent taps of the call-staff button race safely:
   the loser's INSERT fails the constraint and the API re-reads the
   winner's row instead of erroring.
3. **One settled payment per order** — partial unique index on
   `payments.order_id WHERE voided_at IS NULL`. Concurrent
   double-checkout is caught by the constraint and surfaced as 409; a
   voided row doesn't count, so a corrected order can be re-settled
   with a second row.
4. **Paid or cancelled orders have `closed_at`; resolved calls have
   `resolved_at`; voided payments have `void_reason`** — CHECK
   constraints (the last mirrors the discount pattern: `discount_amount
   > 0` requires `discount_reason`).
5. **Positive amounts** — `menu_items.price > 0`,
   `order_items.quantity > 0` (also capped at 99 by Zod),
   `payments.total_amount >= 0`, `payments.discount_amount >= 0`.

## Multi-tenant isolation rule

Every query in `apps/api` MUST filter by `store_id`. To make this cheap,
`store_id` is denormalized onto `order_items` and `payments` so no query
needs a join just to apply the tenant filter. Cross-tenant lookups return
**404 (not 403)** to avoid existence leaks. Isolation is regression-tested
in `business-cycle.test.ts` by running two stores through the full cycle
concurrently.

## Money and time conventions

- All amounts are **tax-inclusive JPY integers** (no decimals, no
  separate tax column) — `menu_items.tax_rate`/`order_items.tax_rate_snapshot`
  exist only to *decompose* an already-charged total into a receipt's
  tax breakdown (`computeTaxBreakdown`, `@order/core`); they never
  change what's charged.
- All timestamps are **Unix milliseconds** (`integer` columns), generated
  in the Worker via `Date.now()` — D1 has no native datetime. The API
  stays timezone-agnostic; business-day boundaries (JST, UTC+9) are a
  client concern via `jstDayRange`/`toJstDateString` (`@order/core`,
  `domain/time.ts`), used by the sales-history date range.
- Billing totals are always computed from
  `(unit_price_snapshot + Σ price_delta_snapshot) × quantity` per line
  (`sumOrderItems`, `@order/core`), never from live menu or option
  prices.
