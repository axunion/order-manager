# Feature: Checkout & Payments

The admin CheckoutPage / CheckoutPanel: settling bills that customers
have requested. Requires the `session_token` cookie (`requireStore`).

## Current behavior

### Pending bills (`GET /api/payments/pending`)

Returns all `payment_requested` orders with seat name, items, and total,
oldest first. Polled every 5 seconds by the UI.

### Completing payment (`POST /api/payments`)

- Input: `order_id`. The total is always recomputed server-side from item
  snapshots — the client never sends an amount.
- Guards: order must exist in this store (404), be `payment_requested`
  (409 otherwise, with a distinct "already paid" message), and have at
  least one item (409).
- Writes payment INSERT + order UPDATE (`paid`, `closed_at`) atomically
  via `db.batch()`. Concurrent double-payment is blocked by the
  `payments.order_id` UNIQUE constraint → 409.
- Method is hard-coded `'cash'` — the enum's only value (schema comment
  reserves `'card' | 'qr'` for Phase 4).

## Known limitations (→ roadmap)

- **Payments are write-only** — no endpoint or screen reads completed
  payments. No sales history, no daily totals, no way to answer "how much
  did we make today". The data is all there. (Phase 2, top priority with
  cancellation)
- **Cash only** — no card/QR-code payment integration. (Phase 4)
- **No amount adjustment** — no discounts, comps, or service charge.
  (Phase 4)
- **No split billing** — one order, one payment. (Phase 4)
- **No receipts** — neither printed nor digital (領収書/レシート), and no
  8%/10% tax breakdown, which receipts legally need. (Phase 4)
- **No refund/void of a completed payment** — `paid` is terminal;
  correcting a mistake means editing the DB. (Phase 4, with payment
  methods)
