# Feature: Checkout & Payments

The admin CheckoutPage / CheckoutPanel: settling bills that customers
have requested. Requires the `session_token` cookie (`requireStore`).

## Current behavior

### Pending bills (`GET /api/payments/pending`)

Returns all `payment_requested` orders with seat name, items, and total,
oldest first. Polled every 5 seconds by the UI. Each line item includes
its selected options and note, same as the order board — CheckoutPanel
renders both so staff can double-check the bill before settling it.

### Completing payment (`POST /api/payments`)

- Input: `order_id`. The total is always recomputed server-side from item
  snapshots — the client never sends an amount.
- Guards: order must exist in this store (404), be `payment_requested`
  (409 otherwise, with a distinct "already paid" message), and have at
  least one non-`cancelled` item (409, same message as zero items —
  voided-out bills cannot be checked out).
- Writes payment INSERT + order UPDATE (`paid`, `closed_at`) atomically
  via `db.batch()`. Concurrent double-payment is blocked by the
  `payments.order_id` UNIQUE constraint → 409.
- Method is hard-coded `'cash'` — the enum's only value (schema comment
  reserves `'card' | 'qr'` for Phase 4).

### Sending a bill back to the table (`PATCH /api/admin/orders/:id/reopen`)

- Transitions `payment_requested → open`, e.g. when a customer wants to
  add more items before paying. Idempotent if already `open`; 409 if
  `paid` or `cancelled`.

### Sales history (`GET /api/payments?from=<unix_ms>&to=<unix_ms>`)

- Returns completed payments with `paid_at` in `[from, to)`, newest
  first, each joined with its order's seat name and line items.
  Cancelled lines are included and flagged by status — they explain the
  bill, but their amounts are already excluded from `total_amount`. Line
  items carry the same selected-options/note fields as the board and
  pending-bills endpoints, but the admin SalesPage does not render them
  yet (not required by the proposal that shipped options/notes; only
  OrderBoard and CheckoutPanel display them).
- Validation (400): both params required, integers, `from < to`, range
  ≤ 62 days.
- No pagination and no server-side aggregation — the admin SalesPage
  computes totals client-side from the list; a two-month window at
  small-restaurant volume stays well under response limits.
- The admin SalesPage (`/sales`) scopes each query to a JST calendar
  day via `jstDayRange` (`@order/core`, `domain/time.ts`), with
  prev/next-day navigation and a date picker (defaults to today JST).

## Known limitations (→ roadmap)

- **Cash only** — no card/QR-code payment integration. (Phase 4)
- **No amount adjustment** — no discounts, comps, or service charge.
  (Phase 4)
- **No split billing** — one order, one payment. (Phase 4)
- **No receipts** — neither printed nor digital (領収書/レシート), and no
  8%/10% tax breakdown, which receipts legally need. (Phase 4)
- **No refund/void of a completed payment** — `paid` is terminal;
  correcting a mistake means editing the DB. (Phase 4, with payment
  methods)
