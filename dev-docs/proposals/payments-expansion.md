# Split Billing (Deferred)

**Status:** backlog — items 1 (cashless methods), 2 (adjustments/discounts),
and 4 (void/refund) from this proposal's original scope shipped in Phase 4
and are now documented in
[checkout.md](../specs/features/checkout.md#completing-payment-post-apipayments)
and [domain-model.md](../specs/domain-model.md). Only split billing (the
original item 3) remains — deferred, not implemented, revisit only on
real pilot demand. See [roadmap.md](../roadmap.md) Phase 4 item 4.

## Split billing

No pilot restaurant has generated an actual demand signal for this, and
the original scoping was to ship it last and "only on real demand." This
sketch is the recommended starting point if it's ever picked up.

`payments.order_id` is no longer a plain UNIQUE constraint — Phase 4's
void/refund work already changed it to a partial unique index
(`idx_one_settled_payment_per_order`, scoped to `voided_at IS NULL`) so
a voided payment's row doesn't block re-settling the same order. Split
billing needs a second, orthogonal generalization: allowing **more than
one settled row** per order.

- Sketch: a `payments` row becomes a partial settlement with `amount`;
  the order transitions to `paid` when settlements sum to the items
  total (transition inside the same `db.batch` as the final payment
  INSERT, guarded by a recomputed remainder).
- Concurrency: the remainder check must be constraint-backed or
  serialized (D1 has no row locks — consider a `payments_settled_total`
  counter column on orders updated in the same batch, with a CHECK
  against overpayment).
- Split by amount only (どんぶり勘定), not by items — drastically
  simpler and matches izakaya reality.
- Must compose with void/refund: voiding one settlement in a
  multi-payment order needs its own reasoning about what "reopen the
  order" means when other settlements are still in place — not designed
  yet, resolve when this is picked up.

## Interactions to respect

The server-computes-every-amount-from-snapshots invariant established
in Phase 4 still applies: clients only ever send intents (method,
discount, void, and eventually split amount), never totals.
