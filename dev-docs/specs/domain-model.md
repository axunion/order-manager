# Domain Model

Source of truth: `packages/db/src/schema.ts`. This document explains the
*why* behind the schema and the rules that every feature must respect.

## Entity overview

```
stores 1 ──── * menu_categories 1 ──── * menu_items
   │                                        │ (snapshot at order time)
   ├──── * seats 1 ──── * orders 1 ──── * order_items
   │                        │
   ├──── * sessions         └──── 0..1 payments
   └──── * magic_link_tokens
```

- **stores** — one row per tenant. Owner email doubles as the login id.
- **menu_categories / menu_items** — the sellable catalog. Items may be
  uncategorized (`category_id` nullable). Prices are tax-inclusive JPY
  integers.
- **seats** — physical tables. Each has an unguessable `qr_token` (UUID)
  that authenticates the customer order screen.
- **orders** — one "check" per table visit, not per submission. Items
  accumulate on the same order until it is paid.
- **order_items** — line items with `name_snapshot` /
  `unit_price_snapshot` copied at order time, so later menu edits never
  change a bill.
- **payments** — exactly one per paid order (`order_id` UNIQUE).
- **sessions / magic_link_tokens** — auth artifacts; see
  [features/authentication.md](./features/authentication.md).

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
  ▲                    │
  └───(staff reopens)──┘

open, payment_requested ──(staff cancels)──▶ cancelled
```

- `open` — items can be added by the customer.
- `payment_requested` — bill locked; adding items returns 409. Set by the
  customer; staff can send it back to `open` (`PATCH
  /api/admin/orders/:id/reopen`, idempotent if already `open`).
- `paid` — terminal. `closed_at` must be set (DB CHECK constraint).
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

## Invariants (DB-enforced)

1. **One active order per seat** — partial unique index on
   `orders.seat_id WHERE status IN ('open','payment_requested')`. Handles
   concurrent Workers racing to create the first order.
2. **One payment per order** — `payments.order_id` UNIQUE. Concurrent
   double-checkout is caught by the constraint and surfaced as 409.
3. **Paid or cancelled orders have `closed_at`** — CHECK constraint.
4. **Positive amounts** — `menu_items.price > 0`,
   `order_items.quantity > 0` (also capped at 99 by Zod),
   `payments.total_amount >= 0`.

## Multi-tenant isolation rule

Every query in `apps/api` MUST filter by `store_id`. To make this cheap,
`store_id` is denormalized onto `order_items` and `payments` so no query
needs a join just to apply the tenant filter. Cross-tenant lookups return
**404 (not 403)** to avoid existence leaks. Isolation is regression-tested
in `business-cycle.test.ts` by running two stores through the full cycle
concurrently.

## Money and time conventions

- All amounts are **tax-inclusive JPY integers** (no decimals, no separate
  tax column). Reduced-rate (8%) vs standard (10%) breakdown for receipts
  is a Phase 4 concern and will require a schema change.
- All timestamps are **Unix milliseconds** (`integer` columns), generated
  in the Worker via `Date.now()` — D1 has no native datetime. The API
  stays timezone-agnostic; business-day boundaries (JST, UTC+9) are a
  client concern via `jstDayRange`/`toJstDateString` (`@order/core`,
  `domain/time.ts`), used by the sales-history date range.
- Billing totals are always computed from
  `unit_price_snapshot × quantity`, never from live menu prices.
