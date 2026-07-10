# Order Cancellation & Correction

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 2, item 1)

Make every pre-payment mistake recoverable by staff, with an audit trail.
Covers: item void, un-serve, order reopen, and whole-order cancellation.
Customer self-cancel is **deliberately excluded from v1** (decision below).

## Schema changes

1. `order_items.status` gains `'cancelled'`:
   `ordered → served` stays; both `ordered` and `served` may transition to
   `cancelled` (wrong dish can be voided after delivery). Terminal.
   Update the `order_items_status_chk` CHECK constraint.
2. `orders.status` gains `'cancelled'` (walkouts, mistaken table):
   `open | payment_requested → cancelled`. Terminal; sets `closed_at`.
   - Update `orders_status_chk`.
   - Extend the closed-at rule: `status NOT IN ('paid','cancelled') OR
     closed_at IS NOT NULL` (replaces `orders_paid_has_closed_at_chk`).
   - The partial unique index (`open`,`payment_requested` only) is
     untouched — a cancelled order frees the seat, like `paid`.

SQLite cannot alter CHECK constraints in place; `pnpm db:generate` will
produce a table-rebuild migration. Verify FK integrity in the migration
test.

## Core logic change

`sumOrderItems` (`packages/core/src/domain/order.ts`) must **exclude
cancelled items**. It is the single total-computation helper used by
order bootstrap, admin board, pending payments, and checkout — change it
once, add unit tests, and every total stays consistent.

## API (all under `requireStore`, existing conventions apply)

| Endpoint | Transition | Guards |
| --- | --- | --- |
| `PATCH /api/admin/orders/items/:id/cancel` | `ordered\|served → cancelled` | 409 if parent order is `paid` or `cancelled`; idempotent if already `cancelled` |
| `PATCH /api/admin/orders/items/:id/unserve` | `served → ordered` | 409 if item `cancelled` or parent order not active |
| `PATCH /api/admin/orders/:id/reopen` | `payment_requested → open` | 200 idempotent if already `open`; 409 if `paid`/`cancelled` |
| `PATCH /api/admin/orders/:id/cancel` | `open\|payment_requested → cancelled` | 409 if `paid`; idempotent if already `cancelled`; also cancels all non-cancelled items (single `db.batch`) |

All are single-row-scoped with `store_id` filters; cross-tenant → 404.

## Checkout interaction

`POST /api/payments` currently rejects orders with zero items; extend the
guard to "zero **non-cancelled** items" (409, same message). `paid` and
`cancelled` orders both reject with the existing status guard.

## Customer-facing display

The order bootstrap keeps returning cancelled items (with their status)
so the customer sees a strikethrough line rather than a silently
shrinking bill. Totals already exclude them via `sumOrderItems`.

## Admin UI

- OrderBoard: per-item "void" and "un-serve" actions (confirm dialog for
  void via `@order/ui` ConfirmDialog); per-order "cancel order" action.
- CheckoutPanel: "send back to table" (reopen) action per pending bill.

## Decision: no customer self-cancel in v1

Once an order reaches the kitchen, cancellation is a negotiation, not a
button — self-cancel invites cook-then-cancelled disputes. Staff-mediated
void covers the need. Revisit with pilot feedback (candidate: cancel
allowed while item `ordered` and < 60s old).

## Testing

- Worker tests per endpoint: transition matrix (each status × each
  action), idempotency, cross-tenant 404, paid-order 409.
- `business-cycle.test.ts` additions: void an item mid-cycle and assert
  the checkout total excludes it; cancel a whole order and assert the
  seat accepts a fresh order.
- Frontend tests: OrderBoard void/un-serve flows, CheckoutPanel reopen.
