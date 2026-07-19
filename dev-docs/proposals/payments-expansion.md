# Payments Expansion (Methods, Adjustments, Split, Refund)

**Status:** ready — open decisions resolved 2026-07-19 (roadmap Phase 4,
items 1, 3, 5; item 4 deferred, see below). Implementation order:
item 1 (cashless methods) → item 3 (adjustments) → item 5 (void/refund),
ahead of receipts-and-tax.md item 2 so the receipt view can render
discounts from the start.

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

**Resolved:** whole-check discount only, per-item comps deferred —
per-item pressure would instead reuse Phase 2 item-void.

## 3. Split billing — deferred

**Resolved: not implemented in this Phase 4 pass.** No pilot restaurant
has generated an actual demand signal for this yet, and the proposal
itself scopes it to ship last and "only on real demand." Left as a
backlog item; revisit if/when a real store asks for it. If built, the
sketch below is still the recommended starting point.

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
- Split by amount only (どんぶり勘定), not by items — drastically
  simpler and matches izakaya reality.

## 4. Payment void / refund

- Sketch: `payments.voided_at` (nullable) + `void_reason`; voiding a
  payment reopens the order to `payment_requested` (same batch), from
  which it can be corrected and re-settled or cancelled via Phase 2
  order-cancel. Sales queries exclude voided payments; SalesPage lists
  them struck-through.
- No partial refunds in v1 — void is all-or-nothing per payment.

## Interactions to respect

- Receipts ([receipts-and-tax.md](./receipts-and-tax.md)) render
  discounts — adjustments (item 3 above) ships before receipts so the
  receipt view supports discount rendering from the start. Splits are
  moot for now since item 4 (split billing) is deferred.
- All items keep the invariant: **the server computes every amount from
  snapshots; clients only ever send intents** (method, discount, void),
  never totals.
