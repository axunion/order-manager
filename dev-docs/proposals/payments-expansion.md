# Payments Expansion (Methods, Adjustments, Split, Refund)

**Status:** design sketch — drafted 2026-07-11 (roadmap Phase 4, items 1, 3–5).
Deliberately lower fidelity: the right design depends on Phase 2 pilot
data (how checkout is actually operated). Resolve the open decisions and
promote to "ready" before implementing.

## 1. Cashless payment methods (recording, not processing)

v1 records **which method the customer used at a staff-operated
terminal** — no payment-processor integration.

- `payments.method` enum → `'cash' | 'card' | 'qr'` (the schema comment
  has reserved this since Phase 1). CHECK-constraint update →
  table-rebuild migration.
- `POST /api/payments` gains `method` in the body (Zod enum, still no
  client-provided amount).
- CheckoutPanel: method selector at confirm time; SalesPage: method
  column + per-method totals.

**Open decision:** true processor integration (Stripe Terminal, Square,
PayPay API…) — evaluate only if pilot restaurants don't already own a
terminal. That work has its own scope (webhooks, secrets per store) and
would be a separate proposal.

## 2. Adjustments (discounts / comps)

- Sketch: `payments` gains `discount_amount` (int ≥ 0, default 0) and
  `discount_reason` (text, required when amount > 0);
  `total_amount` remains the **charged** amount =
  computed items total − discount. Server recomputes and bounds
  (0 ≤ discount ≤ items total); client sends the discount, never the
  total.
- Checkout UI: discount entry behind a deliberate extra tap (misuse
  friction); reason free-text or preset list — decide with the pilot.

**Open decision:** per-item comps vs. whole-check discount. Start
whole-check; per-item pressure would instead reuse Phase 2 item-void.

## 3. Split billing

The heaviest change: today `payments.order_id` is UNIQUE and the paid
transition is atomic with the single payment.

- Sketch: drop the UNIQUE constraint; a `payments` row becomes a partial
  settlement with `amount`; the order transitions to `paid` when
  settlements sum to the items total (transition inside the same
  `db.batch` as the final payment INSERT, guarded by a recomputed
  remainder).
- Concurrency: the remainder check must be constraint-backed or
  serialized (D1 has no row locks — consider a
  `payments_settled_total` counter column on orders updated in the same
  batch, with a CHECK against overpayment).

**Open decision:** split by amount only (どんぶり勘定), or by items?
Amount-only is drastically simpler and matches izakaya reality — start
there, if at all. This item ships **last** in Phase 4 and only on real
demand.

## 4. Payment void / refund

- Sketch: `payments.voided_at` (nullable) + `void_reason`; voiding a
  payment reopens the order to `payment_requested` (same batch), from
  which it can be corrected and re-settled or cancelled via Phase 2
  order-cancel. Sales queries exclude voided payments; SalesPage lists
  them struck-through.
- No partial refunds in v1 — void is all-or-nothing per payment.

## Interactions to respect

- Receipts ([receipts-and-tax.md](./receipts-and-tax.md)) must render
  discounts and (if implemented) splits — sequence receipts after
  adjustments, or scope receipt v1 to unadjusted checks.
- All four items keep the invariant: **the server computes every amount
  from snapshots; clients only ever send intents** (method, discount,
  void), never totals.
